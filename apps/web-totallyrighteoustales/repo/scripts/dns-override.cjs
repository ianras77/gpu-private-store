const dns = require('dns');
const originalLookup = dns.lookup;

const mapping = {
  'registry.npmjs.org': ['104.16.9.34', '104.16.7.34', '104.16.0.34'],
  'registry.npmmirror.com': ['104.18.133.177', '104.18.132.177']
};

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

dns.lookup = function(hostname, options, callback) {
  const normalized = String(hostname);
  if (Object.prototype.hasOwnProperty.call(mapping, normalized)) {
    const ip = pick(mapping[normalized]);
    if (typeof options === 'function') {
      return options(null, ip, 4);
    }
    return callback(null, ip, 4);
  }
  return originalLookup.call(dns, hostname, options, callback);
};
