function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

module.exports = {
  info: (msg) => console.log(`[${timestamp()}] INFO  ${msg}`),
  warn: (msg) => console.warn(`[${timestamp()}] WARN  ${msg}`),
  error: (msg) => console.error(`[${timestamp()}] ERROR ${msg}`),
};
