import { Link } from 'react-router-dom';
import { Camera, ScanLine, ShoppingBag, ArrowUpRight } from 'lucide-react';
import { Badge, EmptyState } from '../../components/common/UI';
export default function About() {
  return (
    <div className="container page">
      <div className="about-hero">
        <span className="eyebrow">ROOTED IN TRADITION. OPEN TO POSSIBILITY.</span>
        <h1>
          See your style
          <br />
          in a <em>new light.</em>
        </h1>
        <p>
          TryOnBD brings Bangladeshi fashion and an interactive digital fitting room into one
          thoughtful shopping experience.
        </p>
        <Link className="btn btn-primary" to="/try-on">
          Explore the studio
          <ArrowUpRight size={17} />
        </Link>
      </div>
      <div className="steps-grid">
        {[
          {
            icon: ShoppingBag,
            title: 'Discover a piece',
            text: 'Browse fictional local fashion, filter your favorites, and find a look that sparks something.',
          },
          {
            icon: Camera,
            title: 'Bring your own perspective',
            text: 'Upload a photo or use your camera. Your images stay in browser memory.',
          },
          {
            icon: ScanLine,
            title: 'Make it your own',
            text: 'Move, resize, and rotate canvas overlays. Save a demo session or download your preview.',
          },
        ].map((s) => (
          <article className="panel p-7" key={s.title}>
            <s.icon className="text-forest mb-5" />
            <h3>{s.title}</h3>
            <p className="muted mt-3">{s.text}</p>
          </article>
        ))}
      </div>
      <div className="feature-classification">
        {[
          {
            title: 'Working today',
            tone: 'green',
            text: 'Responsive shopping, local cart and wishlist, camera access, image upload, manual canvas overlays, real REST calls, DTO validation, and API response inspection.',
          },
          {
            title: 'Demo & local',
            tone: 'amber',
            text: 'Product records, role switching, authentication screens, orders, invoices, dashboards, subscriptions, analytics, and clothing processing are demonstrations.',
          },
          {
            title: 'The next chapter',
            tone: 'neutral',
            text: 'Database persistence, secure authentication and authorization, face landmarks, pose detection, AI clothing fitting, image hosting, payments, shipping, and order item persistence.',
          },
        ].map((s) => (
          <section className="panel p-7" key={s.title}>
            <Badge tone={s.tone}>{s.title}</Badge>
            <p className="mt-4 muted">{s.text}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
export function NotFound() {
  return (
    <div className="container page">
      <EmptyState
        title="A little off the beaten path."
        description="We couldn’t find that page. Your next favorite look is still waiting."
        action={
          <Link to="/" className="btn btn-primary">
            Back to home
          </Link>
        }
      />
    </div>
  );
}
