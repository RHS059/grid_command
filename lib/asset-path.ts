/** Prefix public assets and plain links for a GitHub Pages project site. */
export function assetPath(path: string) {
  return `${process.env.NEXT_PUBLIC_BASE_PATH || ''}${path}`
}
