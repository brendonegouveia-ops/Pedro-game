// Artifact build only: Phaser comes from a CDN <script> as the global `Phaser`.
export default (window as unknown as { Phaser: typeof import('phaser') }).Phaser;
