export default function Footer() {
  return (
    <footer className="ftr border-t border-white/10/">
      <div className="container-narrow">
        © {new Date().getFullYear()} LightChallenge — Testnet 504
      </div>
    </footer>
  )
}