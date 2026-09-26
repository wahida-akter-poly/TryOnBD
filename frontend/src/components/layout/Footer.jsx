import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Logo, RoleSwitcher } from './Navbar';
import { ConnectionStatus } from '../common/DemoNotice';
export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <Logo light />
          <p>
            Rooted in tradition.
            <br />
            Reimagined for you.
          </p>
          <span className="text-xs text-white/50">A fashion-tech frontend demonstration.</span>
        </div>
        <div>
          <h4>Explore</h4>
          <Link to="/products">The collection</Link>
          <Link to="/categories">Shop by category</Link>
          <Link to="/try-on">
            Virtual try-on <ArrowUpRight size={12} />
          </Link>
        </div>
        <div>
          <h4>Make it yours</h4>
          <Link to="/dashboard/customer">Your account</Link>
          <Link to="/seller-register">Become a seller</Link>
          <Link to="/about">How it works</Link>
        </div>
        <div>
          <h4>Behind the experience</h4>
          <Link to="/api-playground">API Playground</Link>
          <RoleSwitcher />
          <ConnectionStatus />
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} TryOnBD. Thoughtfully imagined in Bangladesh.</span>
        <span>Demo commerce · No real payments or shipping</span>
      </div>
    </footer>
  );
}
