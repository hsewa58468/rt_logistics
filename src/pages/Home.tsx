import React from 'react'
import Button from '../components/Button'

const Home = () => {
  return (
    <div className="glass-card">
      <h1>React Foundation</h1>
      <p>
        歡迎使用 RT Logistics 的 React 基礎專案。
        這是一個具備頂級視覺效果、毛玻璃設計與深色模式的現代化起點。
      </p>
      <HomeActions />
      <div style={{ marginTop: '2rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
        使用 Vite + React + Vanilla CSS 建立
      </div>
    </div>
  )
}

const HomeActions = () => {
  return <Button onClick={() => alert('專案已啟動！')}>立即開始</Button>
}

export default Home
