// SVGO config for the tile assets (packages/client/public/tiles).
// Run: pnpm dlx svgo -f public/tiles --config svgo.config.mjs (from packages/client)
//
// removeViewBox is disabled: the tiles rely on their 210×255 viewBox for the
// aspect-ratio fit (see .tile in index.css). Everything else is preset-default.
export default {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          removeViewBox: false,
        },
      },
    },
  ],
};
