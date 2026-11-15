// The list vite.config.ts builds from public/nasa: each file's path under the site root and its size.
declare module 'virtual:media-list' {
  const list: { file: string; bytes: number }[]
  export default list
}
