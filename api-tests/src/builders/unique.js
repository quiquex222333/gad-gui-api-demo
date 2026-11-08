let counter = 0;

function uniqueId() {
  const worker = process.env.TEST_WORKER_INDEX || process.env.TEST_PARALLEL_INDEX || '0';
  counter += 1;
  return `${Date.now()}${worker}${counter}`;
}

module.exports = { uniqueId };
