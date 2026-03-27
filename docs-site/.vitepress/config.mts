import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'FlexGate',
  description: 'Production-grade API Gateway with built-in observability, security, and reliability',
  base: '/flexgate-proxy/',
  
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#3eaf7c' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:locale', content: 'en' }],
    ['meta', { name: 'og:site_name', content: 'FlexGate Documentation' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API Reference', link: '/api/routes' },
      { text: 'v0.1.0-beta.1', link: 'https://github.com/tapas100/flexgate-proxy/releases' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Quick Start', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Your First Route', link: '/guide/first-route' }
          ]
        },
        {
          text: 'Admin UI',
          items: [
            { text: 'Overview', link: '/guide/admin-ui/overview' },
            { text: 'Managing Routes', link: '/guide/admin-ui/routes' },
            { text: 'Monitoring', link: '/guide/admin-ui/monitoring' },
            { text: 'Settings', link: '/guide/admin-ui/settings' }
          ]
        },
        {
          text: 'Configuration',
          items: [
            { text: 'Routes', link: '/guide/config/routes' },
            { text: 'Rate Limiting', link: '/guide/config/rate-limiting' },
            { text: 'Circuit Breaker', link: '/guide/config/circuit-breaker' },
            { text: 'Load Balancing', link: '/guide/config/load-balancing' },
            { text: 'Health Checks', link: '/guide/config/health-checks' }
          ]
        },
        {
          text: 'Security',
          items: [
            { text: 'Authentication', link: '/guide/security/authentication' },
            { text: 'Authorization', link: '/guide/security/authorization' },
            { text: 'SSL/TLS', link: '/guide/security/ssl' },
            { text: 'CORS', link: '/guide/security/cors' },
            { text: 'API Keys', link: '/guide/security/api-keys' }
          ]
        },
        {
          text: 'Observability',
          items: [
            { text: 'Metrics', link: '/guide/observability/metrics' },
            { text: 'Logging', link: '/guide/observability/logging' },
            { text: 'Tracing', link: '/guide/observability/tracing' },
            { text: 'Prometheus', link: '/guide/observability/prometheus' },
            { text: 'Grafana', link: '/guide/observability/grafana' }
          ]
        },
        {
          text: 'Deployment',
          items: [
            { text: 'Quick Setup Guide', link: '/guide/deployment/quick-setup' },
            { text: 'Production Setup', link: '/guide/deployment/production' },
            { text: 'Docker/Podman', link: '/guide/deployment/containers' },
            { text: 'Kubernetes', link: '/guide/deployment/kubernetes' },
            { text: 'Cloud Platforms', link: '/guide/deployment/cloud' },
            { text: 'High Availability', link: '/guide/deployment/ha' }
          ]
        },
        {
          text: 'Troubleshooting',
          items: [
            { text: 'Installation Issues', link: '/guide/troubleshooting' },
            { text: 'Common Errors', link: '/guide/troubleshooting#common-installation-failures' },
            { text: 'Recovery Scripts', link: '/guide/troubleshooting#recovery-procedures' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'REST API',
          items: [
            { text: 'Overview', link: '/api/overview' },
            { text: 'Routes API', link: '/api/routes' },
            { text: 'Metrics API', link: '/api/metrics' },
            { text: 'Health API', link: '/api/health' },
            { text: 'Admin API', link: '/api/admin' }
          ]
        },
        {
          text: 'Configuration',
          items: [
            { text: 'YAML Schema', link: '/api/config-schema' },
            { text: 'Environment Variables', link: '/api/environment' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/tapas100/flexgate-proxy' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/flexgate-proxy' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-2026 FlexGate Contributors'
    },

    search: {
      provider: 'local'
    },

    editLink: {
      pattern: 'https://github.com/tapas100/flexgate-proxy/edit/main/docs-site/:path',
      text: 'Edit this page on GitHub'
    },

    lastUpdated: {
      text: 'Last updated',
      formatOptions: {
        dateStyle: 'medium',
        timeStyle: 'short'
      }
    }
  },

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    },
    lineNumbers: true
  }
})
