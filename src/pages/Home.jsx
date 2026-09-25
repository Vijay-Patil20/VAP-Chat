import { Link } from 'react-router-dom'

function Home() {
  return (
    <main className="app">
      <section className="hero">
        <div className="logo">VAP CHAT</div>

        <h1>Temporary. Anonymous. Simple.</h1>

        <p className="subtitle">
          Talk without creating an account.
        </p>

        <div className="actions">
          <Link to="/create" className="primary-button">
            Create Chat
          </Link>

          <Link to="/join" className="secondary-button">
            Join Chat
          </Link>
        </div>

        <p className="privacy-note">
          No account • No name • Temporary
        </p>
      </section>
    </main>
  )
}

export default Home