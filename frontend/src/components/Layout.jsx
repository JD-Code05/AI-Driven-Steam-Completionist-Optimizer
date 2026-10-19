import Navbar from './Navbar'

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="max-w-[1160px] mx-auto px-5 pt-4 pb-12">
        {children}
      </main>
    </div>
  )
}
