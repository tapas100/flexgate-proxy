# Day 3-4: Build Landing Page

**Goal:** Simple 1-page site to capture interest

## Option 1: Ultra-Fast (Recommended for Launch)

### Use a Template (1-2 hours)
1. **Carrd.co** (Free tier)
   - Pre-built templates
   - No coding needed
   - Custom domain support
   - Cost: FREE (or $19/year for Pro)

2. **Setup Steps:**
   ```
   1. Go to carrd.co
   2. Choose "Product" template
   3. Customize:
      - Headline: "The Kong Alternative for Startups"
      - Subhead: "Production-grade API gateway at $49/mo instead of $2,000/mo"
      - CTA: "Star on GitHub" → link to repo
      - Features: 3-4 key benefits
      - Pricing table
   4. Connect domain (flexgate.dev)
   5. Publish!
   ```

**Time:** 2 hours  
**Cost:** $0-19/year

---

## Option 2: Custom Site (Better long-term)

### Tech Stack
- **Framework:** Next.js 14 + Tailwind CSS
- **Hosting:** Vercel (FREE)
- **Components:** shadcn/ui (FREE)

### Quick Setup
```bash
# 1. Create Next.js app
npx create-next-app@latest flexgate-landing --typescript --tailwind --app

cd flexgate-landing

# 2. Install shadcn
npx shadcn-ui@latest init

# 3. Add components
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card

# 4. Create landing page
# (Copy template below)

# 5. Deploy to Vercel
npm install -g vercel
vercel --prod
```

**Time:** 4-6 hours  
**Cost:** FREE

---

## Landing Page Template (Next.js)

Create `app/page.tsx`:

```typescript
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero */}
      <div className="container mx-auto px-4 py-20">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-6xl font-bold mb-6">
            The Kong Alternative for <span className="text-blue-600">Startups</span>
          </h1>
          <p className="text-2xl text-gray-600 mb-8">
            Production-grade API gateway with circuit breakers, rate limiting, 
            and observability—at $49/mo instead of $2,000/mo
          </p>
          <div className="flex gap-4 justify-center">
            <Button size="lg" asChild>
              <Link href="https://github.com/tapas100/flexgate-proxy">
                ⭐ Star on GitHub
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/docs">
                📚 Documentation
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="container mx-auto px-4 py-20">
        <h2 className="text-4xl font-bold text-center mb-12">
          Why Choose FlexGate?
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <Card className="p-6">
            <h3 className="text-2xl font-bold mb-4">🚀 Fast Setup</h3>
            <p className="text-gray-600">
              5-minute install. Docker one-liner. No complex config.
              Kong takes hours—we take minutes.
            </p>
          </Card>
          <Card className="p-6">
            <h3 className="text-2xl font-bold mb-4">💰 Affordable</h3>
            <p className="text-gray-600">
              $49/mo for all features. Kong Enterprise is $2,000+/mo.
              Save $23,000/year.
            </p>
          </Card>
          <Card className="p-6">
            <h3 className="text-2xl font-bold mb-4">🛡️ Production-Ready</h3>
            <p className="text-gray-600">
              Circuit breakers, rate limiting, SSRF protection.
              Threat-modeled from day one.
            </p>
          </Card>
        </div>
      </div>

      {/* Pricing */}
      <div className="container mx-auto px-4 py-20 bg-gray-50">
        <h2 className="text-4xl font-bold text-center mb-12">
          Simple Pricing
        </h2>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Free */}
          <Card className="p-8">
            <h3 className="text-2xl font-bold mb-4">Free</h3>
            <p className="text-4xl font-bold mb-6">$0<span className="text-lg text-gray-600">/mo</span></p>
            <ul className="space-y-2 mb-8">
              <li>✓ Core proxy features</li>
              <li>✓ Circuit breakers</li>
              <li>✓ Rate limiting</li>
              <li>✓ Prometheus metrics</li>
              <li>✓ Community support</li>
            </ul>
            <Button className="w-full" variant="outline" asChild>
              <Link href="https://github.com/tapas100/flexgate-proxy">
                Get Started
              </Link>
            </Button>
          </Card>

          {/* Pro */}
          <Card className="p-8 border-blue-500 border-2 relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-4 py-1 rounded-full text-sm">
              Coming Soon
            </div>
            <h3 className="text-2xl font-bold mb-4">Pro</h3>
            <p className="text-4xl font-bold mb-6">$49<span className="text-lg text-gray-600">/mo</span></p>
            <ul className="space-y-2 mb-8">
              <li>✓ Everything in Free</li>
              <li>✓ Admin Dashboard UI</li>
              <li>✓ OAuth/SAML auth</li>
              <li>✓ Email support</li>
              <li>✓ Priority updates</li>
            </ul>
            <Button className="w-full" disabled>
              Q2 2026
            </Button>
          </Card>

          {/* Enterprise */}
          <Card className="p-8">
            <h3 className="text-2xl font-bold mb-4">Enterprise</h3>
            <p className="text-4xl font-bold mb-6">Custom</p>
            <ul className="space-y-2 mb-8">
              <li>✓ Everything in Pro</li>
              <li>✓ White-label</li>
              <li>✓ Dedicated support</li>
              <li>✓ 99.9% SLA</li>
              <li>✓ Custom development</li>
            </ul>
            <Button className="w-full" variant="outline" asChild>
              <Link href="mailto:sales@flexgate.dev">
                Contact Sales
              </Link>
            </Button>
          </Card>
        </div>
      </div>

      {/* CTA */}
      <div className="container mx-auto px-4 py-20 text-center">
        <h2 className="text-4xl font-bold mb-6">
          Ready to Save $2,000/month?
        </h2>
        <Button size="lg" asChild>
          <Link href="https://github.com/tapas100/flexgate-proxy">
            Get Started Free →
          </Link>
        </Button>
      </div>
    </main>
  )
}
```

---

## Checklist for Day 3-4

- [ ] Choose approach (Carrd vs Next.js)
- [ ] Build landing page
- [ ] Add GitHub link prominently
- [ ] Add email capture (optional: ConvertKit free tier)
- [ ] Connect domain
- [ ] Test on mobile
- [ ] Deploy!

---

## What to Include on Landing Page

### Must Have:
1. **Clear headline** - "The Kong Alternative for Startups"
2. **Value prop** - "$49/mo instead of $2,000/mo"
3. **CTA button** - "Star on GitHub" or "Get Started Free"
4. **3 key benefits** - Fast, affordable, production-ready
5. **Pricing table** - Free, Pro, Enterprise
6. **Link to docs** - GitHub repo

### Nice to Have:
1. Demo video (can add later)
2. Testimonials (get after launch)
3. Comparison table (vs Kong, AWS)
4. Email signup form

---

## Next: Day 5-7 (Write Launch Content)

After landing page is live, move to content creation!
