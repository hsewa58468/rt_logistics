import React, { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { readBarcodes } from 'zxing-wasm/reader'
import { supabase } from '../lib/supabase'
import './Scan.scss'

// ---------- 型別 ----------
type LogStatus = 'ok' | 'dup' | 'err'

interface ParsedBarcode {
  codeNumber: string
  weightKg: number
  date: string | null
  rule: string
  batch?: string
  serial?: string
  dueDate?: string | null
}

interface LogEntry {
  id: number
  raw: string
  codeNumber: string
  name: string
  weightKg: number
  date: string | null
  status: LogStatus
  rule: string
  batch?: string
  serial?: string
  dueDate?: string | null
  ts: Date
}

// ---------- 品號對照表（唯一資料來源是 Supabase scan_code 資料表） ----------
const CODE_NAMES_TABLE = 'scan_code'

// ---------- GS1-128 AI（Application Identifier）解析 ----------
// 固定長度 AI：值為「AI 後面資料」的位數（不含 AI 本身）
const GS1_FIXED_LEN: Record<string, number> = {
  '00': 18, '01': 14, '02': 14,
  '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6,
  '20': 2,
  '31': 6, '32': 6, '33': 6, '34': 6, '35': 6, '36': 6, // 310x~360x 以 startsWith 比對
  '41': 13,
}
// 變動長度 AI（有最大長度，以 FNC1/GS 字元或字串結尾為界）
const GS1_VAR_MAXLEN: Record<string, number> = {
  '10': 20, '21': 20, '22': 20, '30': 8, '37': 8,
  '240': 30, '241': 30, '242': 6, '250': 30, '251': 30, '253': 30, '254': 20, '255': 25,
  '400': 30, '401': 30, '402': 17, '403': 30,
  '410': 13, '411': 13, '412': 13, '413': 13, '414': 13, '415': 13, '416': 13,
  '420': 20, '421': 15, '422': 3, '423': 15, '424': 3, '425': 15, '426': 3,
  '7001': 13, '7002': 30, '7003': 10, '703': 30,
  '8003': 30, '8004': 30, '8005': 6, '8006': 18, '8007': 34, '8008': 12,
  '8010': 30, '8011': 12, '8012': 20, '8013': 25, '8017': 18, '8018': 18, '8019': 10,
  '8020': 25, '8100': 6, '8101': 10, '8102': 2,
  '90': 30, '91': 90, '92': 90, '93': 90, '94': 90, '95': 90, '96': 90, '97': 90, '98': 90, '99': 90,
}
const GS1_SEP = '\x1d' // FNC1/GS 分隔字元（部分條碼機會傳出此控制字元）

function gs1FixedLenFor(ai: string): number | null {
  if (GS1_FIXED_LEN[ai] != null) return GS1_FIXED_LEN[ai]
  if (ai.length === 4 && GS1_FIXED_LEN[ai.slice(0, 2)] != null && /^3[1-6]/.test(ai)) {
    return GS1_FIXED_LEN[ai.slice(0, 2)]
  }
  return null
}

// 解析「純數字串接」格式的 GS1-128 內容（掃描槍常見輸出），回傳 {AI: 值}
function parseConcatenatedGS1(data: string): Record<string, string> | null {
  const ais: Record<string, string> = {}
  let i = 0
  let foundAny = false
  while (i < data.length) {
    if (data[i] === GS1_SEP) { i++; continue }
    // AI 前綴長度可能是 2~4 碼，依序嘗試比對已知表
    let matched: string | null = null
    for (const len of [4, 3, 2]) {
      const candidate = data.slice(i, i + len)
      if (candidate.length < len) continue
      if (!/^\d+$/.test(candidate)) continue
      if (GS1_VAR_MAXLEN[candidate] != null || gs1FixedLenFor(candidate) != null) {
        matched = candidate
        break
      }
    }
    if (!matched) { i++; continue } // 無法辨識的片段，跳過一個字元再試

    const ai = matched
    i += ai.length
    const fixedLen = gs1FixedLenFor(ai)
    if (fixedLen != null) {
      const value = data.slice(i, i + fixedLen)
      if (value.length < fixedLen) break
      ais[ai] = value
      i += fixedLen
    } else {
      const maxLen = GS1_VAR_MAXLEN[ai] ?? 20
      let end = data.indexOf(GS1_SEP, i)
      if (end === -1 || end - i > maxLen) end = Math.min(data.length, i + maxLen)
      ais[ai] = data.slice(i, end)
      i = end
    }
    foundAny = true
  }
  return foundAny ? ais : null
}

// 解析「括號標示」格式，例如 (01)00076338581194(11)251223(21)0105005346
function parseBracketedGS1(data: string): Record<string, string> | null {
  const re = /\((\d{2,4})\)\s*([^()]*)/g
  const ais: Record<string, string> = {}
  let m: RegExpExecArray | null
  let foundAny = false
  while ((m = re.exec(data))) {
    ais[m[1]] = m[2].trim()
    foundAny = true
  }
  return foundAny ? ais : null
}

function gs1DateToISO(yymmdd: string): string | null {
  if (!yymmdd || yymmdd.length !== 6) return null
  const yy = yymmdd.slice(0, 2)
  const mm = yymmdd.slice(2, 4)
  const dd = yymmdd.slice(4, 6)
  return `20${yy}-${mm}-${dd}`
}

function parseGS1_128(raw: string): ParsedBarcode | null {
  const ais = parseBracketedGS1(raw) || parseConcatenatedGS1(raw)
  if (!ais) return null

  const gtin = ais['01'] || ais['02']
  if (!gtin) return null // 沒有 GTIN(01/02) 就不當作標準 GS1-128 處理

  let weightKg = 0
  for (const ai of Object.keys(ais)) {
    if (/^31\d\d$/.test(ai)) {
      const decimals = Number(ai[3])
      weightKg = parseFloat(ais[ai]) / Math.pow(10, decimals)
      break
    }
  }
  if (!weightKg) {
    for (const ai of Object.keys(ais)) {
      if (/^32\d\d$/.test(ai)) {
        const decimals = Number(ai[3])
        const lb = parseFloat(ais[ai]) / Math.pow(10, decimals)
        weightKg = lb * 0.453592
        break
      }
    }
  }

  const prodRaw = ais['11'] || ais['13']
  const date = prodRaw && prodRaw.length === 6 ? gs1DateToISO(prodRaw) : (prodRaw || null)
  const dueRaw = ais['17'] || ais['15']
  const dueDate = dueRaw && dueRaw.length === 6 ? gs1DateToISO(dueRaw) : (dueRaw || null)

  return {
    codeNumber: gtin,
    weightKg: weightKg || 0,
    date,
    dueDate,
    batch: ais['10'],
    serial: ais['21'],
    rule: 'GS1-128',
  }
}

// ---------- 舊版廠區磅秤條碼解析（移植自 program1~program9，作為 GS1-128 辨識不到時的備援） ----------
function fmtWeight(numStr: string): number {
  const intPart = parseInt(numStr.slice(0, 2), 10)
  const decPart = numStr.slice(2)
  return parseFloat(intPart + '.' + decPart)
}
const ymd = (a: string, b: string, c: string) => a + b + c

function tryDateSlashRule(data: string): ParsedBarcode | null {
  const slashCount = (data.match(/\//g) || []).length
  if (slashCount < 2) return null

  const dateMatch = data.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/)
  if (!dateMatch) return null

  const before = data.slice(0, dateMatch.index)
  const after = data.slice((dateMatch.index ?? 0) + dateMatch[0].length)

  const codeMatch = before.match(/(\d+)[^\d]*$/)
  if (!codeMatch) return null
  const codeNumber = codeMatch[1]

  const weightMatch = after.match(/(\d+(?:\.\d+)?)/)
  if (!weightMatch) return null
  const weightKg = parseFloat(weightMatch[1])
  if (isNaN(weightKg)) return null

  const yyyy = dateMatch[1]
  const mm = dateMatch[2].padStart(2, '0')
  const dd = dateMatch[3].padStart(2, '0')
  return { codeNumber, weightKg, date: ymd(yyyy, mm, dd), rule: '日期格式(YYYY/MM/DD)' }
}

function parseLegacyScaleBarcode(raw: string): ParsedBarcode | null {
  const data = raw.trim()
  const dateRule = tryDateSlashRule(data)
  if (dateRule) return dateRule

  const len = data.length
  try {
    if (len === 46) {
      if (data.startsWith('2800')) {
        const codeNumber = data.slice(17, 22)
        const weightKg = fmtWeight(data.slice(25, 29))
        const pd = data.slice(29, 37)
        return { codeNumber, weightKg, date: ymd(pd.slice(4), pd.slice(2, 4), pd.slice(0, 2)), rule: '2800·46碼' }
      }
      if (data.startsWith('01900')) {
        const codeNumber = data.slice(10, 15)
        const lb = fmtWeight(data.slice(23, 26))
        const weightKg = lb * 0.453592
        const pd = data.slice(28, 34)
        return { codeNumber, weightKg, date: ymd('20' + pd.slice(0, 2), pd.slice(2, 4), pd.slice(4)), rule: '01900·46碼' }
      }
      if (data.startsWith('01906')) {
        const codeNumber = data.slice(11, 15)
        const weightKg = fmtWeight(data.slice(22, 26))
        const pd = data.slice(28, 34)
        return { codeNumber, weightKg, date: ymd('20' + pd.slice(0, 2), pd.slice(2, 4), pd.slice(4)), rule: '01906·46碼' }
      }
      return null
    }
    if (len === 48) {
      if (data.startsWith('01900')) {
        const codeNumber = data.slice(10, 15)
        const pd = data.slice(18, 24)
        const weightKg = fmtWeight(data.slice(30, 34))
        return { codeNumber, weightKg, date: ymd('20' + pd.slice(0, 2), pd.slice(2, 4), pd.slice(4)), rule: '01900·48碼' }
      }
      if (data.startsWith('01994')) {
        const codeNumber = data.slice(10, 15)
        const pd = data.slice(18, 24)
        const weightKg = fmtWeight(data.slice(30, 34))
        return { codeNumber, weightKg, date: ymd(pd.slice(0, 2), pd.slice(2, 4), pd.slice(4)), rule: '01994·48碼' }
      }
      if (data.startsWith('01993')) {
        const codeNumber = data.slice(12, 16)
        const pd = data.slice(28, 34)
        const weightKg = fmtWeight(data.slice(22, 25))
        return { codeNumber, weightKg, date: ymd(pd.slice(0, 2), pd.slice(2, 4), pd.slice(4)), rule: '01993·48碼' }
      }
      if (data.startsWith('0196')) {
        const codeNumber = data.slice(10, 15)
        const pd = data.slice(18, 24)
        const weightKg = fmtWeight(data.slice(30, 34))
        return { codeNumber, weightKg, date: ymd(pd.slice(0, 2), pd.slice(2, 4), pd.slice(4)), rule: '0196·48碼' }
      }
      return null
    }
    if (len === 47) {
      if (data.startsWith('0105')) {
        const codeNumber = data.slice(12, 17)
        const pd = data.slice(28, 34)
        const weightKg = fmtWeight(data.slice(22, 26))
        return { codeNumber, weightKg, date: ymd(pd.slice(0, 2), pd.slice(2, 4), pd.slice(4)), rule: '0105·47碼' }
      }
      return null
    }
    if (len === 29) {
      const parts = data.split(/\s+/).filter(Boolean)
      const codeNumber = parts[parts.length - 1]
      const weightKg = fmtWeight(data.slice(8, 12))
      return { codeNumber, weightKg, date: null, rule: '29碼' }
    }
    return null
  } catch {
    return null
  }
}

// GS1-128 優先；辨識不到 GTIN(01) 時才退回廠區磅秤舊格式
function parseBarcode(raw: string): ParsedBarcode | null {
  return parseGS1_128(raw) || parseLegacyScaleBarcode(raw)
}

// 料號對照表比對：先試完全比對，找不到再做模糊比對。
// GS1-128 解析出來的料號是完整 14 碼 GTIN（例如 00076338581194），而對照表裡登記的
// 常常是供應商自己的短料號（例如 58119，剛好是 GTIN 其中一段），所以模糊比對用
// 「對照表的料號是不是出現在掃到的料號字串裡（或反過來）」來判斷。只比對 4 碼以上的
// 料號，避免太短的料號到處都能命中、誤判一堆不相干的結果；多個候選時取比對碼最長
// （最具體）的那一筆。
function findCodeName(codeNumber: string, codeNames: Record<string, string>): string {
  if (codeNames[codeNumber]) return codeNames[codeNumber]

  let bestMatch = ''
  let bestLen = 0
  for (const code of Object.keys(codeNames)) {
    if (code.length < 4) continue
    const isSubstringMatch = codeNumber.includes(code) || code.includes(codeNumber)
    if (isSubstringMatch && code.length > bestLen) {
      bestMatch = code
      bestLen = code.length
    }
  }
  return bestMatch ? codeNames[bestMatch] : ''
}

// ---------- 小工具 ----------
let audioCtx: AudioContext | null = null
function beep(freq: number, dur: number, type: OscillatorType = 'sine') {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur)
    osc.connect(gain); gain.connect(audioCtx.destination)
    osc.start(); osc.stop(audioCtx.currentTime + dur)
  } catch { /* 無法播放提示音就略過 */ }
}

function barcodeFormats() {
  const F = Html5QrcodeSupportedFormats
  return [F.CODE_128, F.CODE_39, F.CODE_93, F.CODABAR, F.EAN_13, F.EAN_8, F.ITF, F.UPC_A, F.UPC_E, F.QR_CODE]
}

function loadImageFromFile(file: File): Promise<{ img: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => resolve({ img, url })
    img.onerror = reject
    img.src = url
  })
}
function rotateToCanvas(img: HTMLImageElement, deg: number): HTMLCanvasElement {
  const w = img.naturalWidth, h = img.naturalHeight
  const swap = deg % 180 !== 0
  const canvas = document.createElement('canvas')
  canvas.width = swap ? h : w
  canvas.height = swap ? w : h
  const ctx = canvas.getContext('2d')!
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.drawImage(img, -w / 2, -h / 2)
  return canvas
}
// 手機瀏覽器（主要是 Android Chrome/Edge）內建的原生條碼辨識引擎，準確率比純 JS
// 解碼好很多，而且直接吃 canvas、不需要先轉存成圖檔再解一次壓縮損失。
// iOS Safari 目前不支援，會自動退回下面的 zxing 解碼路徑。
function createNativeBarcodeDetector(): any {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null
  try {
    return new (window as any).BarcodeDetector({
      formats: ['code_128', 'code_39', 'code_93', 'codabar', 'ean_13', 'ean_8', 'itf', 'upc_a', 'upc_e', 'qr_code'],
    })
  } catch {
    return null // 裝置宣稱支援 BarcodeDetector，但不支援其中某個格式時會在建構時丟例外
  }
}
const nativeBarcodeDetector: any = createNativeBarcodeDetector()

// zxing-wasm 的備援解碼器（iOS Safari 等不支援原生 BarcodeDetector 的瀏覽器用）。
// 這是把 ZXing 原生 C++ 引擎（zxing-cpp）編譯成 WebAssembly，準確率/容錯率比純 JS
// 版的 zxing-js 好很多，而且預設就會開 tryHarder / tryRotate / tryInvert / tryDownscale，
// 針對「真實拍照、有角度、對焦不完美」這種情境本來就比 html5-qrcode 的預設設定更強。
// 直接吃 ImageData（canvas 的 getImageData），不需要先轉成圖檔再解一次壓縮損失。
const ZXING_READER_OPTIONS = {
  formats: ['Code128', 'Code39', 'Code93', 'Codabar', 'EAN13', 'EAN8', 'ITF', 'UPCA', 'UPCE', 'QRCode'] as const,
  tryHarder: true,
  maxNumberOfSymbols: 5,
}

async function detectFromCanvas(canvas: HTMLCanvasElement): Promise<string[]> {
  if (nativeBarcodeDetector) {
    try {
      const results = await nativeBarcodeDetector.detect(canvas)
      const texts = results.map((r: any) => r.rawValue).filter(Boolean)
      if (texts.length) return texts
    } catch { /* 原生辨識失敗就退回下面的 zxing-wasm 路徑再試一次 */ }
  }
  try {
    const ctx = canvas.getContext('2d')
    if (!ctx) return []
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const results = await readBarcodes(imageData, ZXING_READER_OPTIONS)
    return results.map((r) => r.text).filter(Boolean)
  } catch {
    return [] // 這塊畫面沒有可辨識的條碼，屬正常情況
  }
}

function buildGridRegions(w: number, h: number, cols: number, rows: number, overlap: number, offsetX: number, offsetY: number) {
  const tileW = w / cols, tileH = h / rows
  const regions: number[][] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx0 = c * tileW + offsetX, cy0 = r * tileH + offsetY
      const cx1 = cx0 + tileW, cy1 = cy0 + tileH
      const x0 = Math.max(0, cx0 - tileW * overlap)
      const y0 = Math.max(0, cy0 - tileH * overlap)
      const x1 = Math.min(w, cx1 + tileW * overlap)
      const y1 = Math.min(h, cy1 + tileH * overlap)
      if (x1 - x0 < 15 || y1 - y0 < 15) continue
      regions.push([x0, y0, x1 - x0, y1 - y0])
    }
  }
  return regions
}
async function decodeMultiFromFile(file: File): Promise<string[]> {
  const { img, url } = await loadImageFromFile(file)
  const found = new Set<string>()
  const rotations = [0, 90, 180, 270]
  const cols = 3, rows = 3, overlap = 0.22

  function tileRegionsFor(canvas: HTMLCanvasElement) {
    const w = canvas.width, h = canvas.height
    return [
      [0, 0, w, h],
      ...buildGridRegions(w, h, cols, rows, overlap, 0, 0),
      ...buildGridRegions(w, h, cols, rows, overlap, w / (cols * 2), h / (rows * 2)),
    ]
  }
  async function scanRegions(canvas: HTMLCanvasElement, regions: number[][]) {
    let any = false
    for (const [x, y, rw, rh] of regions) {
      const tileCanvas = document.createElement('canvas')
      tileCanvas.width = Math.max(1, Math.round(rw))
      tileCanvas.height = Math.max(1, Math.round(rh))
      tileCanvas.getContext('2d')!.drawImage(canvas, x, y, rw, rh, 0, 0, tileCanvas.width, tileCanvas.height)
      const texts = await detectFromCanvas(tileCanvas)
      if (texts.length) { texts.forEach((t) => found.add(t)); any = true }
    }
    return any
  }

  let bestRotation = 0, foundOrientation = false
  for (const deg of rotations) {
    const canvas = rotateToCanvas(img, deg)
    const texts = await detectFromCanvas(canvas)
    if (texts.length) { texts.forEach((t) => found.add(t)); bestRotation = deg; foundOrientation = true; break }
  }

  const mainCanvas = rotateToCanvas(img, bestRotation)
  await scanRegions(mainCanvas, tileRegionsFor(mainCanvas))

  if (found.size === 0) {
    for (const deg of rotations) {
      if (deg === bestRotation && foundOrientation) continue
      const canvas = rotateToCanvas(img, deg)
      const any = await scanRegions(canvas, tileRegionsFor(canvas))
      if (any) break
    }
  }

  URL.revokeObjectURL(url)
  return [...found]
}

// ---------- 畫面元件 ----------
const Scan: React.FC = () => {
  const [codeNames, setCodeNames] = useState<Record<string, string>>({})
  const [log, setLog] = useState<LogEntry[]>([])
  const seenRaw = useRef<Set<string>>(new Set())
  const seqRef = useRef(0)

  const [status, setStatus] = useState<{ kind: '' | 'ok' | 'warn' | 'err'; text: string }>({ kind: '', text: '待命中' })
  const [readout, setReadout] = useState<
    | { type: 'empty' }
    | { type: 'ok'; parsed: ParsedBarcode; name: string }
    | { type: 'dup'; raw: string }
    | { type: 'err'; raw: string }
  >({ type: 'empty' })

  const [scanInputVal, setScanInputVal] = useState('')
  const [batchInputVal, setBatchInputVal] = useState('')
  const scanInputRef = useRef<HTMLInputElement>(null)

  const [cameraRunning, setCameraRunning] = useState(false)
  const [showScanArea, setShowScanArea] = useState(false)
  const [showTorchBtn, setShowTorchBtn] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [cameraHint, setCameraHint] = useState('將條碼「橫向」置於框內、盡量填滿寬度，距離約 10-15 公分，保持穩定不要手震')
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null)
  const lastCamDecode = useRef('')
  const lastCamTime = useRef(0)

  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [codeSearch, setCodeSearch] = useState('')
  const [dbStatusNote, setDbStatusNote] = useState('尚未連線資料庫')

  // ---------- Supabase scan_code 同步 ----------
  async function loadCodeNamesFromDB() {
    const { data, error } = await supabase.from(CODE_NAMES_TABLE).select('code,name').order('code')
    if (error) throw error
    const map: Record<string, string> = {}
    for (const r of data || []) map[r.code] = r.name
    return map
  }
  async function upsertCodeNameDB(code: string, name: string) {
    const { error } = await supabase.from(CODE_NAMES_TABLE).upsert({ code, name })
    if (error) throw error
  }
  async function deleteCodeNameDB(code: string) {
    const { error } = await supabase.from(CODE_NAMES_TABLE).delete().eq('code', code)
    if (error) throw error
  }
  async function bulkUpsertCodeNamesDB(map: Record<string, string>) {
    const rows = Object.entries(map).map(([code, name]) => ({ code, name }))
    if (!rows.length) return 0
    const { error } = await supabase.from(CODE_NAMES_TABLE).upsert(rows)
    if (error) throw error
    return rows.length
  }

  useEffect(() => {
    scanInputRef.current?.focus()
    ;(async () => {
      try {
        const map = await loadCodeNamesFromDB()
        setCodeNames(map)
        setDbStatusNote(`已連線資料庫，共 ${Object.keys(map).length} 筆（所有人共用同一份）`)
      } catch (e) {
        setDbStatusNote('資料庫連線失敗，暫時無法讀取料號對照表：' + (e as Error).message)
      }
    })()
    return () => { stopCamera() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleScan(rawInput: string) {
    const raw = rawInput.trim()
    if (!raw) return

    const id = ++seqRef.current
    const ts = new Date()

    if (seenRaw.current.has(raw)) {
      setLog((l) => [{ id, raw, codeNumber: '—', name: '', weightKg: 0, date: null, status: 'dup', rule: '', ts }, ...l])
      beep(220, 0.18, 'square')
      setStatus({ kind: 'warn', text: '重複條碼，已略過' })
      setReadout({ type: 'dup', raw })
      return
    }

    const parsed = parseBarcode(raw)
    if (!parsed) {
      setLog((l) => [{ id, raw, codeNumber: '—', name: '', weightKg: 0, date: null, status: 'err', rule: '', ts }, ...l])
      beep(140, 0.25, 'sawtooth')
      setStatus({ kind: 'err', text: '無法辨識的格式' })
      setReadout({ type: 'err', raw })
      return
    }

    seenRaw.current.add(raw)
    const name = findCodeName(parsed.codeNumber, codeNames)
    setLog((l) => [{ id, raw, codeNumber: parsed.codeNumber, name, weightKg: parsed.weightKg, date: parsed.date, status: 'ok', rule: parsed.rule, batch: parsed.batch, serial: parsed.serial, dueDate: parsed.dueDate, ts }, ...l])
    beep(880, 0.12, 'sine')
    setStatus({ kind: 'ok', text: '掃描成功' })
    setReadout({ type: 'ok', parsed, name })
  }

  function deleteLogEntry(id: number) {
    setLog((l) => {
      const entry = l.find((e) => e.id === id)
      if (entry) seenRaw.current.delete(entry.raw)
      return l.filter((e) => e.id !== id)
    })
  }

  function clearAll() {
    if (!confirm('確定要清空所有掃描資料嗎？此動作無法復原。')) return
    setLog([])
    seenRaw.current.clear()
    seqRef.current = 0
    setReadout({ type: 'empty' })
    setStatus({ kind: '', text: '待命中' })
  }

  function computeGroups() {
    const groups = new Map<string, { name: string; count: number; weight: number }>()
    for (const entry of log) {
      if (entry.status !== 'ok') continue
      if (!groups.has(entry.codeNumber)) groups.set(entry.codeNumber, { name: entry.name, count: 0, weight: 0 })
      const g = groups.get(entry.codeNumber)!
      g.count += 1
      g.weight += entry.weightKg
    }
    return groups
  }

  function exportCSV() {
    const groups = computeGroups()
    const lines = ['料號,品名,箱數,總重量kg']
    for (const [code, g] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`${code},${g.name},${g.count},${g.weight.toFixed(2)}`)
    }
    lines.push('')
    lines.push('時間,料號,品名,重量kg,生產日期,狀態,原始資料')
    for (const e of [...log].reverse()) {
      const statusText = e.status === 'ok' ? 'OK' : e.status === 'dup' ? '重複' : '無法辨識'
      lines.push(`${e.ts.toLocaleString('zh-TW')},${e.codeNumber},${e.name},${e.status === 'ok' ? e.weightKg.toFixed(2) : ''},${e.date || ''},${statusText},"${e.raw}"`)
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '秤重掃描紀錄_' + new Date().toISOString().slice(0, 10) + '.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ---------- 相機 ----------
  async function startCamera() {
    setCameraRunning(true)
    setShowScanArea(true)
    try {
      const inst = new Html5Qrcode('reader', {
        formatsToSupport: barcodeFormats(),
        verbose: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      } as any)
      html5QrCodeRef.current = inst
      await inst.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 340, height: 160 },
          aspectRatio: 1.5,
          videoConstraints: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        },
        (decodedText) => {
          const now = Date.now()
          if (decodedText === lastCamDecode.current && now - lastCamTime.current < 2500) return
          lastCamDecode.current = decodedText
          lastCamTime.current = now
          handleScan(decodedText)
        },
        () => { /* 每幀掃描失敗屬正常，忽略 */ },
      )
      setupTorchButton()
    } catch (err: any) {
      setCameraHint('無法啟動相機：' + (err?.message || err) + '（可改用下方「拍照掃描」）')
      setCameraRunning(false)
    }
  }
  function setupTorchButton() {
    setShowTorchBtn(false)
    try {
      const inst = html5QrCodeRef.current as any
      const track = inst?.getRunningTrackCapabilities ? inst.getRunningTrackCapabilities() : null
      if (track && track.torch) setShowTorchBtn(true)
    } catch { /* 不支援手電筒能力偵測，略過即可 */ }
  }
  async function toggleTorch() {
    const inst = html5QrCodeRef.current as any
    const next = !torchOn
    try {
      await inst.applyVideoConstraints({ advanced: [{ torch: next }] })
      setTorchOn(next)
    } catch { /* 這台裝置不支援手電筒控制，略過 */ }
  }
  async function stopCamera() {
    const inst = html5QrCodeRef.current
    if (inst && cameraRunning) {
      try { await inst.stop(); inst.clear() } catch { /* ignore */ }
    }
    setCameraRunning(false)
    setShowTorchBtn(false)
    setShowScanArea(false)
  }

  async function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    if (!files.length) return
    setShowScanArea(true)

    let totalFound = 0
    for (let i = 0; i < files.length; i++) {
      setCameraHint(
        files.length > 1
          ? `正在分析第 ${i + 1}/${files.length} 張照片（自動嘗試不同角度＋切格），找不到時可能需要 10-20 秒…`
          : '正在分析照片（自動嘗試不同角度＋切格），找不到時可能需要 10-20 秒…',
      )
      try {
        const texts = await decodeMultiFromFile(files[i])
        texts.forEach((t) => handleScan(t))
        totalFound += texts.length
      } catch { /* 這張照片辨識失敗，繼續處理下一張 */ }
    }

    if (totalFound === 0) {
      setCameraHint('找不到可辨識的條碼，請對焦清楚、避免反光、拍攝時讓條碼正對鏡頭並盡量填滿畫面')
    } else {
      setCameraHint(`共辨識到 ${totalFound} 個條碼，可繼續拍照或上傳下一批，或關閉相機區塊`)
    }
  }

  // ---------- 料號對照表管理 ----------
  async function addOrUpdateCode() {
    const code = newCode.trim()
    const name = newName.trim()
    if (!code || !name) { alert('請輸入料號與品名'); return }
    setCodeNames((prev) => ({ ...prev, [code]: name }))
    setNewCode(''); setNewName('')
    try { await upsertCodeNameDB(code, name) }
    catch (e) { alert('已顯示在畫面上，但寫入資料庫失敗，其他人暫時看不到這筆更新：\n' + (e as Error).message) }
  }
  async function removeCode(code: string) {
    setCodeNames((prev) => { const next = { ...prev }; delete next[code]; return next })
    try { await deleteCodeNameDB(code) }
    catch (e) { alert('已從畫面上移除，但從資料庫刪除失敗：\n' + (e as Error).message) }
  }
  function exportCodeNames() {
    const sorted: Record<string, string> = {}
    Object.keys(codeNames).sort((a, b) => a.localeCompare(b)).forEach((k) => (sorted[k] = codeNames[k]))
    const blob = new Blob([JSON.stringify(sorted, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'code_names.json'; a.click()
    URL.revokeObjectURL(url)
  }
  async function onImportCodeNamesFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('格式不符')
      setCodeNames((prev) => ({ ...prev, ...data }))
      alert('已匯入 ' + Object.keys(data).length + ' 筆料號對照')
    } catch {
      alert('匯入失敗，請確認是正確的 JSON 檔案（格式：{"料號":"品名", ...}）')
    }
  }
  async function migrateToDB() {
    if (!confirm(`確定要把目前畫面上共 ${Object.keys(codeNames).length} 筆料號對照，整批寫入資料庫嗎？\n（同料號會直接覆蓋資料庫中的版本）`)) return
    try {
      const n = await bulkUpsertCodeNamesDB(codeNames)
      alert(`已寫入資料庫，共 ${n} 筆`)
      setDbStatusNote(`已連線資料庫，共 ${Object.keys(codeNames).length} 筆（所有人共用同一份）`)
    } catch (e) {
      alert('寫入資料庫失敗：\n' + (e as Error).message)
    }
  }

  const groups = computeGroups()
  const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const grandCount = sortedGroups.reduce((s, [, g]) => s + g.count, 0)
  const grandWeight = sortedGroups.reduce((s, [, g]) => s + g.weight, 0)

  const codeNameEntries = Object.entries(codeNames)
    .filter(([code, name]) => {
      const f = codeSearch.trim().toLowerCase()
      return !f || code.toLowerCase().includes(f) || name.toLowerCase().includes(f)
    })
    .sort((a, b) => a[0].localeCompare(b[0]))

  const dotClass = 'dot' + (status.kind === 'ok' || status.kind === '' ? '' : status.kind === 'warn' ? ' warn' : ' err')

  return (
    <div className="scan-page">
      <div className="wrap">
        <header>
          <h1>秤重<span>掃描</span>站</h1>
          <div className="hstat">
            <span><span className={dotClass} />{status.text}</span>
            <span>今日筆數 <b style={{ color: 'var(--amber)' }}>{log.filter((e) => e.status === 'ok').length}</b></span>
          </div>
        </header>

        <div className="panel readout">
          {readout.type === 'empty' && (
            <div className="readout-empty">尚未掃描 — 請將游標停在下方輸入框，開始掃描條碼</div>
          )}
          {readout.type === 'ok' && (
            <div>
              <div className="readout-row">
                <div>
                  <div className="readout-label">料號 / 品名</div>
                  <div className="readout-code">{readout.parsed.codeNumber}</div>
                  <div className={readout.name ? 'readout-name' : 'readout-name name-unknown'}>{readout.name || '（未登錄品名）'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="readout-label">重量</div>
                  <div className="readout-weight">{readout.parsed.weightKg.toFixed(2)}<small>KG</small></div>
                </div>
              </div>
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <span className="dim mono" style={{ fontSize: 12 }}>
                  {readout.parsed.rule}
                  {readout.parsed.date ? ` · 生產日期 ${readout.parsed.date}` : ''}
                  {readout.parsed.dueDate ? ` · 有效日期 ${readout.parsed.dueDate}` : ''}
                  {readout.parsed.batch ? ` · 批號 ${readout.parsed.batch}` : ''}
                  {readout.parsed.serial ? ` · 序號 ${readout.parsed.serial}` : ''}
                </span>
                <span className="badge ok">OK</span>
              </div>
            </div>
          )}
          {readout.type === 'dup' && (
            <div>
              <div className="readout-row">
                <div>
                  <div className="readout-label">料號 / 品名</div>
                  <div className="readout-code">{readout.raw}</div>
                  <div className="readout-name name-unknown">此條碼已掃描過</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="readout-label">重量</div>
                  <div className="readout-weight">—</div>
                </div>
              </div>
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="dim mono" style={{ fontSize: 12 }}>已自動排除，未計入加總</span>
                <span className="badge dup">重複</span>
              </div>
            </div>
          )}
          {readout.type === 'err' && (
            <div>
              <div className="readout-row">
                <div>
                  <div className="readout-label">料號 / 品名</div>
                  <div className="readout-code">{readout.raw}</div>
                  <div className="readout-name name-unknown">長度 {readout.raw.length} 碼，無符合的解析規則</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="readout-label">重量</div>
                  <div className="readout-weight">—</div>
                </div>
              </div>
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="dim mono" style={{ fontSize: 12 }}>未計入加總</span>
                <span className="badge err">無法辨識</span>
              </div>
            </div>
          )}

          <div className="scan-input-wrap">
            <label>掃描輸入（掃描槍 / 鍵盤輸入後按 Enter，或使用下方相機）</label>
            <input
              id="scanInput"
              ref={scanInputRef}
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="在此掃描條碼…（支援 GS1-128 條碼）"
              value={scanInputVal}
              onChange={(e) => setScanInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault()
                  const val = scanInputVal
                  setScanInputVal('')
                  handleScan(val)
                }
              }}
            />
          </div>

          <div className="row-actions">
            <button className="btn primary" onClick={() => (cameraRunning ? stopCamera() : startCamera())}>
              {cameraRunning ? '⏹ 關閉相機' : '📷 即時相機掃描'}
            </button>
            <label className="btn" style={{ display: 'inline-block' }}>
              📸 拍照掃描
              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onPhotoSelected} />
            </label>
            <label className="btn" style={{ display: 'inline-block' }}>
              🖼️ 上傳圖片（可一次選多張）
              <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onPhotoSelected} />
            </label>
          </div>
          <div style={{ display: showScanArea ? 'block' : 'none', marginTop: 12 }}>
            <div id="reader" style={{ width: '100%', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }} />
            <div className="row-actions" style={{ marginTop: 8 }}>
              {showTorchBtn && (
                <button className="btn" onClick={toggleTorch}>{torchOn ? '🔦 關閉手電筒' : '🔦 開啟手電筒'}</button>
              )}
            </div>
            <div className="dim mono" style={{ fontSize: 11, marginTop: 6, textAlign: 'center' }}>{cameraHint}</div>
          </div>

          <details>
            <summary>批次貼上多筆資料（每行一筆）</summary>
            <textarea
              id="batchInput"
              placeholder="貼上多行條碼原始資料，每行一筆"
              value={batchInputVal}
              onChange={(e) => setBatchInputVal(e.target.value)}
            />
            <div className="row-actions">
              <button
                className="btn primary"
                onClick={() => {
                  batchInputVal.split('\n').forEach((l) => { if (l.trim()) handleScan(l) })
                  setBatchInputVal('')
                }}
              >批次匯入</button>
            </div>
          </details>
        </div>

        <div className="panel">
          <h2 className="section-title">料號加總</h2>
          <table>
            <thead>
              <tr><th>料號</th><th>品名</th><th style={{ textAlign: 'right' }}>箱數</th><th style={{ textAlign: 'right' }}>總重量 (kg)</th></tr>
            </thead>
            <tbody>
              {sortedGroups.map(([code, g]) => (
                <tr key={code}>
                  <td className="mono">{code}</td>
                  <td className={g.name ? '' : 'name-unknown'}>{g.name || '未登錄品名'}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{g.count}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{g.weight.toFixed(2)}</td>
                </tr>
              ))}
              {sortedGroups.length > 0 && (
                <tr className="total-row">
                  <td colSpan={2}>總計</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{grandCount}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{grandWeight.toFixed(2)}</td>
                </tr>
              )}
            </tbody>
          </table>
          {sortedGroups.length === 0 && <div className="empty-hint">尚無資料</div>}
        </div>

        <div className="panel">
          <h2 className="section-title">掃描紀錄</h2>
          <table>
            <thead>
              <tr><th>時間</th><th>料號</th><th style={{ textAlign: 'right' }}>重量</th><th>狀態</th><th /></tr>
            </thead>
            <tbody>
              {log.map((entry) => (
                <tr key={entry.id}>
                  <td className="mono dim">{entry.ts.toLocaleTimeString('zh-TW', { hour12: false })}</td>
                  <td className="mono">
                    {entry.codeNumber}
                    {entry.name && <><br /><span className="dim" style={{ fontSize: 11 }}>{entry.name}</span></>}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>{entry.status === 'ok' ? entry.weightKg.toFixed(2) : '—'}</td>
                  <td>
                    {entry.status === 'ok' && <span className="badge ok">OK</span>}
                    {entry.status === 'dup' && <span className="badge dup">重複</span>}
                    {entry.status === 'err' && <span className="badge err">無法辨識</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="del-btn" title="刪除" onClick={() => deleteLogEntry(entry.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {log.length === 0 && <div className="empty-hint">尚無掃描紀錄</div>}
          <div className="row-actions">
            <button className="btn" onClick={exportCSV}>匯出 CSV</button>
            <button className="btn danger" onClick={clearAll}>清空所有資料</button>
          </div>
        </div>

        <div className="panel">
          <h2 className="section-title">料號對照表管理</h2>
          <div className="dim mono" style={{ fontSize: 11, marginBottom: 10 }}>{dbStatusNote}</div>
          <div className="row-actions" style={{ marginTop: 0 }}>
            <input
              type="text" placeholder="料號，例如 4823" value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addOrUpdateCode() }}
              style={{ flex: 1, minWidth: 120, background: '#0e1012', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--mono)', padding: '8px 10px' }}
            />
            <input
              type="text" placeholder="品名，例如 澳洲 S 板腱" value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addOrUpdateCode() }}
              style={{ flex: 2, minWidth: 160, background: '#0e1012', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', padding: '8px 10px' }}
            />
            <button className="btn primary" onClick={addOrUpdateCode}>新增／更新</button>
          </div>
          <div style={{ marginTop: 10 }}>
            <input
              type="text" placeholder="搜尋料號或品名…" value={codeSearch}
              onChange={(e) => setCodeSearch(e.target.value)}
              style={{ width: '100%', background: '#0e1012', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', padding: '8px 10px', fontFamily: 'var(--mono)', fontSize: 13 }}
            />
          </div>
          <div className="code-names-scroll">
            <table style={{ marginTop: 10 }}>
              <thead><tr><th>料號</th><th>品名</th><th /></tr></thead>
              <tbody>
                {codeNameEntries.map(([code, name]) => (
                  <tr key={code}>
                    <td className="mono">{code}</td>
                    <td>{name}</td>
                    <td style={{ textAlign: 'right' }}><button className="del-btn" title="刪除" onClick={() => removeCode(code)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {codeNameEntries.length === 0 && <div className="empty-hint">尚無資料</div>}
          </div>
          <div className="row-actions">
            <button className="btn" onClick={exportCodeNames}>匯出對照表 JSON</button>
            <label className="btn" style={{ display: 'inline-block' }}>
              匯入對照表 JSON
              <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={onImportCodeNamesFile} />
            </label>
            <button className="btn primary" onClick={migrateToDB}>將目前對照表整批寫入資料庫</button>
          </div>
          <div className="dim mono" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.7 }}>
            新增/刪除會直接同步到 Supabase 的 <span style={{ color: 'var(--amber)' }}>scan_code</span> 資料表（欄位：code, name），所有人打開網頁都是同一份。
          </div>
        </div>

        <footer>條碼解析：GS1-128（AI 括號 / 純數字串接皆可）優先，辨識不到時退回廠區磅秤舊格式 · 所有掃描紀錄僅保存於本次瀏覽器分頁中</footer>
      </div>
    </div>
  )
}

export default Scan
