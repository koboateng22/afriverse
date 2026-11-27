import { Link } from 'react-router-dom';
import './SiteFooter.css';

/** Footer for the public pages (landing, team): who we are, and the way in. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav aria-label="Afriversity">
        <ul className="site-footer__links" role="list">
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>
            <Link to="/team">Our team</Link>
          </li>
          <li>
            <Link to="/signup">Create an account</Link>
          </li>
          <li>
            <Link to="/login">Sign in</Link>
          </li>
        </ul>
      </nav>
      <p className="site-footer__note">© {new Date().getFullYear()} Afriversity. Built in Ghana for African students.</p>
    </footer>
  );
}
