import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  ScanLine,
  Sparkles,
  Shirt,
  Glasses,
  Gem,
  MoveUpRight,
  Leaf,
  Heart,
  Globe2,
  Check,
  Play,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { images } from '../../data/mock/seed';
import ProductCard from '../../components/product/ProductCard';
import { Badge, Button, Input, Rating } from '../../components/common/UI';
import { useState } from 'react';

function SectionHeading({ eyebrow, title, to, link = 'Explore the collection' }) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {to && (
        <Link className="text-link" to={to}>
          {link}
          <ArrowUpRight size={17} />
        </Link>
      )}
    </div>
  );
}
export default function Home() {
  const { state, toast, setState } = useApp();
  const [email, setEmail] = useState('');
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="little-line" /> THE NEXT CHAPTER OF YOUR STYLE
            </span>
            <h1>
              A new way
              <br />
              to see <em>yourself.</em>
            </h1>
            <p>
              Your favorite styles. Your own reflection.
              <br />
              Discover Bangladeshi fashion and try a new look
              <br className="desktop-break" /> before you make it yours.
            </p>
            <div className="hero-actions">
              <Link to="/products" className="btn btn-primary">
                Explore the collection <ArrowUpRight size={17} />
              </Link>
              <Link to="/try-on" className="btn btn-outline">
                <ScanLine size={18} />
                Try virtually
              </Link>
            </div>
            <div className="hero-proof">
              <div className="avatar-stack">
                {['AR', 'NH', 'RK'].map((x, i) => (
                  <span key={x} style={{ background: ['#c7d5be', '#e5cab3', '#c7cfde'][i] }}>
                    {x}
                  </span>
                ))}
              </div>
              <div>
                <div className="flex gap-1 text-forest">{'★★★★★'}</div>
                <span>Discover your next favorite look</span>
              </div>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-orbit" />
            <div className="hero-image-frame">
              <img
                src={images.hero}
                alt="An editorial fashion look in natural light"
                fetchPriority="high"
                onError={(e) => {
                  e.currentTarget.src = '/assets/person.svg';
                }}
              />
              <div className="hero-image-caption">
                <span>THE EVERYDAY EDIT</span>
                <span>01 / 03</span>
              </div>
            </div>
            <div className="hero-label">
              <span className="scan-icon">
                <ScanLine size={22} />
              </span>
              <div>
                <strong>A little preview. A lot of possibility.</strong>
                <span>Meet the virtual try-on studio</span>
              </div>
              <Link to="/try-on" aria-label="Explore virtual try-on">
                <ArrowUpRight size={21} />
              </Link>
            </div>
            <div className="hero-float">
              <Sparkles size={15} /> YOUR STYLE, REIMAGINED
            </div>
            <span className="hero-side-text">ROOTED IN BANGLADESH · MADE FOR YOU</span>
          </div>
        </div>
        <div className="hero-bottom container">
          <span>Thoughtfully curated. Effortlessly you.</span>
          <span>
            SCROLL TO DISCOVER <span className="ml-3">↓</span>
          </span>
        </div>
      </section>
      <div className="benefit-strip">
        <div className="container">
          <span>
            <ScanLine />
            Try before you decide
          </span>
          <span>
            <Leaf />
            Locally inspired fashion
          </span>
          <span>
            <Heart />
            Find what feels like you
          </span>
          <span>
            <Globe2 />A fresh way to shop
          </span>
        </div>
      </div>
      <section className="section container">
        <SectionHeading
          eyebrow="FIND YOUR EVERYDAY EXTRAORDINARY"
          title="Good style starts here."
          to="/categories"
          link="All collections"
        />
        <div className="category-cards">
          {[
            {
              name: 'Panjabi',
              note: 'Heritage, reimagined',
              id: 4,
              image: images.panjabi,
              icon: Shirt,
            },
            { name: 'Shirts', note: 'Everyday, elevated', id: 3, image: images.shirt, icon: Shirt },
            {
              name: 'Sunglasses',
              note: 'A fresh perspective',
              id: 5,
              image: images.glasses,
              icon: Glasses,
            },
            {
              name: 'Jewelry',
              note: 'The finishing touch',
              id: 6,
              image: images.necklace,
              icon: Gem,
            },
          ].map((c) => (
            <Link to={`/products?category=${c.id}`} className="category-card" key={c.id}>
              <img
                src={c.image}
                alt={`${c.name} collection`}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.src = '/assets/product.svg';
                }}
              />
              <div>
                <span>{c.note}</span>
                <h3>
                  {c.name}
                  <ArrowUpRight size={22} />
                </h3>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section className="section container pt-0">
        <SectionHeading
          eyebrow="THE PIECES YOU’LL REACH FOR"
          title="Currently catching eyes."
          to="/products"
          link="Shop all favorites"
        />
        <div className="product-grid">
          {state.products.slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
      <section className="studio-promo container">
        <div className="studio-promo-art">
          <div className="scan-corner tl" />
          <div className="scan-corner br" />
          <img
            src={images.portrait}
            alt="Portrait ready for a virtual style preview"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.src = '/assets/person.svg';
            }}
          />
          <span className="floating-pill">
            <ScanLine size={16} />
            Your personal style studio
          </span>
          <div className="promo-controls">
            <Shirt />
            <Glasses />
            <Gem />
          </div>
        </div>
        <div className="studio-promo-copy">
          <span className="eyebrow text-emerald-300">LESS GUESSING. MORE YOU.</span>
          <h2>
            What if you could
            <br />
            <em>try it first?</em>
          </h2>
          <p>
            Meet your new fitting room. Explore a look, upload a photo, and make it your own in our
            interactive try-on studio.
          </p>
          <div className="flex flex-wrap gap-2 my-6">
            <Badge tone="dark">Clothing — Phase 2</Badge>
            <Badge tone="dark">Sunglasses face tracking</Badge>
            <Badge tone="dark">Head jewelry</Badge>
          </div>
          <Link to="/try-on" className="btn btn-light">
            Step inside the studio
            <ArrowUpRight size={18} />
          </Link>
          <small>Browser face tracking · Camera or photo · Private by design</small>
        </div>
      </section>
      <section className="section container">
        <SectionHeading
          eyebrow="FRESH FINDS, FRESH POSSIBILITIES"
          title="Just joined the edit."
          to="/products?sort=newest"
          link="See what’s new"
        />
        <div className="product-grid">
          {state.products
            .filter((p) => p.badge === 'New arrival')
            .slice(0, 4)
            .map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
        </div>
      </section>
      <section className="how-section">
        <div className="container">
          <div className="text-center">
            <span className="eyebrow">FROM A LITTLE CURIOSITY TO A NEW FAVORITE</span>
            <h2>Your style. Three simple steps.</h2>
          </div>
          <div className="steps-grid">
            {[
              {
                icon: SearchIcon,
                title: 'Find something you love',
                text: 'Explore our curated edit of local-inspired fashion and thoughtful accessories.',
              },
              {
                icon: ScanLine,
                title: 'See a new side of you',
                text: 'Choose a photo and experiment with a look in our interactive canvas studio.',
              },
              {
                icon: Heart,
                title: 'Make the look yours',
                text: 'Save your favorites, build your bag, and explore a demo checkout.',
              },
            ].map((step, i) => (
              <div className="step" key={step.title}>
                <span className="step-number">0{i + 1}</span>
                <step.icon size={27} strokeWidth={1.3} />
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section container">
        <SectionHeading
          eyebrow="A FEW WORDS FROM OUR DEMO COMMUNITY"
          title="A little love for a new perspective."
        />
        <div className="testimonials">
          {[
            {
              quote:
                'I love being able to explore a style before adding it to my wishlist. It makes finding something new feel so easy.',
              name: 'Ayesha R.',
              city: 'Dhaka',
            },
            {
              quote:
                'The little details make all the difference. A thoughtful space to discover our local style.',
              name: 'Rafi H.',
              city: 'Sylhet',
            },
            {
              quote:
                'From a festive panjabi to an everyday accessory, there’s always something to spark an idea.',
              name: 'Nadia I.',
              city: 'Chattogram',
            },
          ].map((t) => (
            <article key={t.name}>
              <span className="text-forest">★★★★★</span>
              <blockquote>“{t.quote}”</blockquote>
              <strong>{t.name}</strong>
              <span>{t.city} · Fictional demo testimonial</span>
            </article>
          ))}
        </div>
      </section>
      <section className="seller-banner container">
        <div>
          <span className="eyebrow">GOOD CRAFT DESERVES TO BE SEEN</span>
          <h2>Your creations. A whole new audience.</h2>
          <p>Bring your collection to the TryOnBD seller demo.</p>
        </div>
        <Link className="btn btn-primary" to="/seller-register">
          Become a seller
          <ArrowUpRight size={18} />
        </Link>
      </section>
      <section className="newsletter container">
        <div>
          <span className="eyebrow">LET’S STAY IN STYLE</span>
          <h2>A fresh perspective, now and then.</h2>
          <p>Save your interest in new edits and thoughtful finds.</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setState((old) => ({ ...old, settings: { ...old.settings, newsletter: true } }));
            toast('Interest saved locally. No email was sent or subscribed.');
            setEmail('');
          }}
        >
          <div className="newsletter-input">
            <Input
              label="Your email address"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button type="submit" aria-label="Save newsletter interest">
              <ArrowRight size={20} />
            </Button>
          </div>
          <small>Demo signup only. Your address is not sent to a mailing service.</small>
        </form>
      </section>
    </>
  );
}
function SearchIcon(props) {
  return <Sparkles {...props} />;
}
