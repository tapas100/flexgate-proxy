import { defineConfig } from 'vitepress'

export default defineConfig({
  // Site metadata
  title: 'FlexGate Proxy',
  description: 'Production-grade AI-native API gateway with built-in observability, security, and reliability',
  base: '/flexgate-proxy/',

  // Ignore dead links in existing docs (pre-existing stubs)
  ignoreDeadLinks: true,

  // Clean URLs (no .html extension)
  cleanUrls: true,

  // Head tags
  head: [
    ['meta', { name: 'theme-color', content: '#3451b2' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:title', content: 'FlexGate Proxy' }],
    ['meta', { name: 'og:description', content: 'AI-native API gateway — detects failures, analyzes with Claude, auto-heals 80% of incidents.' }],
    ['link', { rel: 'icon', href: '/flexgate-proxy/favicon.ico', type: 'image/x-icon' }],
  ],

  // Theme config
  themeConfig: {
    // Top navigation bar
    nav: [
      { text: 'Getting Started', link: '/getting-started/' },
      { text: 'Guides', link: '/guides/' },
      { text: 'AI Features', link: '/ai/' },
      {
        text: 'Reference',
        items: [
          { text: 'API Reference', link: '/api/' },
          { text: 'CLI Reference', link: '/cli/' },
          { text: 'Architecture', link: '/architecture/' },
        ]
      },
      { text: 'Deployment', link: '/deployment/' },
      {
        text: 'v0.1.0-beta.2',
        items: [
          { text: 'Changelog', link: '/changelog' },
          { text: 'Contributing', link: '/contributing/' },
          { text: 'npm', link: 'https://www.npmjs.com/package/flexgate-proxy' },
        ]
      },
    ],

    // Left sidebar
    sidebar: {
      '/getting-started/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Overview', link: '/getting-started/' },
            { text: 'Quick Start', link: '/getting-started/quickstart' },
            { text: 'Installation', link: '/getting-started/installation' },
            { text: 'Configuration', link: '/getting-started/configuration' },
          ]
        }
      ],

      '/guides/': [
        {
          text: 'Guides',
          items: [
            { text: 'Overview', link: '/guides/' },
            { text: 'Route Management', link: '/features/02-route-management' },
            { text: 'Webhooks', link: '/features/07-webhooks' },
            { text: 'Admin UI', link: '/features/01-admin-ui' },
            { text: 'Observability', link: '/observability' },
            { text: 'Traffic Control', link: '/traffic-control' },
          ]
        }
      ],

      '/ai/': [
        {
          text: 'AI Features',
          items: [
            { text: 'Overview', link: '/ai/' },
            { text: 'Use Cases', link: '/ai/use-cases' },
          ]
        },
        {
          text: 'Playbooks',
          items: [
            { text: 'Incident Response', link: '/ai/playbooks/incident-response' },
            { text: 'Auto-Recovery', link: '/ai/playbooks/auto-recovery' },
            { text: 'Cost Optimization', link: '/ai/playbooks/cost-optimization' },
          ]
        },
        {
          text: 'Testing',
          items: [
            { text: 'Testing Guide', link: '/ai/TESTING_GUIDE' },
          ]
        }
      ],

      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'Full REST API', link: '/api' },
          ]
        }
      ],

      '/cli/': [
        {
          text: 'CLI Reference',
          items: [
            { text: 'Commands', link: '/cli/' },
          ]
        }
      ],

      '/architecture/': [
        {
          text: 'Architecture',
          items: [
            { text: 'Overview', link: '/architecture/' },
            { text: 'System Design', link: '/architecture' },
            { text: 'Threat Model', link: '/threat-model' },
            { text: 'Trade-offs', link: '/trade-offs' },
            { text: 'TypeScript Migration', link: '/typescript-migration' },
          ]
        }
      ],

      '/deployment/': [
        {
          text: 'Deployment',
          items: [
            { text: 'Overview', link: '/deployment/' },
            { text: 'Quick Start', link: '/deployment/quick-start' },
            { text: 'AWS EC2', link: '/deployment/aws-ec2' },
            { text: 'Cloud Comparison', link: '/deployment/cloud-comparison' },
          ]
        }
      ],

      '/contributing/': [
        {
          text: 'Contributing',
          items: [
            { text: 'Guidelines', link: '/contributing/' },
            { text: 'Changelog', link: '/changelog' },
          ]
        }
      ],
    },

    // Social links (top-right)
    socialLinks: [
      { icon: 'github', link: 'https://github.com/tapas100/flexgate-proxy' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/flexgate-proxy' },
    ],

    // Footer
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024–2026 tapas100'
    },

    // Search (built-in, no plugin needed)
    search: {
      provider: 'local'
    },

    // Edit link
    editLink: {
      pattern: 'https://github.com/tapas100/flexgate-proxy/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },

    // Last updated
    lastUpdated: {
      text: 'Last updated',
      formatOptions: {
        dateStyle: 'short',
      }
    },

    // Doc footer navigation
    docFooter: {
      prev: 'Previous',
      next: 'Next'
    },

    // Outline (right-side TOC)
    outline: {
      level: [2, 3],
      label: 'On this page'
    },
  },

  // Markdown config
  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    },
    lineNumbers: true,
  },

  // Last updated via git
  lastUpdated: true,
})
