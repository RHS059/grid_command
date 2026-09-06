const pages = process.env.GITHUB_PAGES === 'true'
const basePath = pages ? '/grid_command' : ''

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(pages ? { output: 'export', basePath, trailingSlash: true } : {}),
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  ...(!pages ? { async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }]
  },
  } : {}),
  images: {
    unoptimized: true,
  },
}

export default nextConfig
