export default function Footer() {
  return (
    <footer className="ftr mt-16 border-t border-(--border) bg-(--surface-2) backdrop-blur-sm">
      <div className="container-narrow py-8 text-center text-sm text-(--text-muted) space-y-3">
        <p>
          © {new Date().getFullYear()} <span className="font-semibold text-(--text)">LightChallenge</span>
        </p>

        <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          <a href="/" className="link-soft hover:text-(--text) transition-colors">
            Home
          </a>
          <a href="/explore" className="link-soft hover:text-(--text) transition-colors">
            Explore
          </a>
          <a href="/challenges/create" className="link-soft hover:text-(--text) transition-colors">
            Create
          </a>
        </nav>
      </div>
    </footer>
  );
}