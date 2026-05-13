import { defineConfig } from 'vitepress'

export default defineConfig({
  base: '/aurora/',
  title: 'Aurora',
  description: 'Gestão de plantões para profissionais de saúde. Calendário, relatórios financeiros e rede de colegas — tudo em um só lugar.',
  lang: 'pt-BR',

  appearance: 'dark',

  head: [
    ['meta', { name: 'theme-color', content: '#007AFF' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:title', content: 'Aurora — Seus plantões sob controle' }],
    ['meta', { name: 'og:description', content: 'Gestão inteligente de plantões para médicos e profissionais de saúde brasileiros.' }],
    ['link', { rel: 'icon', href: '/aurora/favicon.ico' }],
  ],

  themeConfig: {
    siteTitle: 'Aurora',

    nav: [
      { text: 'Início', link: '/' },
      { text: 'Funcionalidades', link: '/features' },
      { text: 'Começar', link: '/getting-started' },
      // {
      //   text: 'Para Devs',
      //   items: [
      //     { text: '⌥ Arquitetura', link: '/guide/architecture' },
      //     { text: '⌥ Guia do Desenvolvedor', link: '/guide/developer' },
      //   ],
      // },
      { text: 'FAQ', link: '/faq' },
      { text: 'Sobre', link: '/about' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guia Técnico',
          items: [
            { text: 'Arquitetura', link: '/guide/architecture' },
            { text: 'Desenvolvedor', link: '/guide/developer' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/amendx/Aurora' },
    ],

    footer: {
      message: 'Construído para profissionais de saúde brasileiros.',
      copyright: '© 2025 Aurora. Todos os direitos reservados.',
    },

    search: {
      provider: 'local',
    },
  },
})
