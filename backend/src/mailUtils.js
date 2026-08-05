'use strict';

function formatAddressList(addressList) {
  if (!Array.isArray(addressList) || addressList.length === 0) return '未知发件人';

  return addressList
    .map((addr) => {
      const name = addr && addr.name ? String(addr.name).trim() : '';
      let email = addr && addr.address ? String(addr.address).trim() : '';

      if (!email && addr && addr.mailbox && addr.host) {
        email = `${addr.mailbox}@${addr.host}`;
      }

      if (name && email) return `${name} <${email}>`;
      return name || email || '未知发件人';
    })
    .join(', ');
}

function maskEmail(email) {
  const value = String(email || '').trim();
  const [name, domain] = value.split('@');
  if (!name || !domain) return value ? '***' : '';
  const first = name.slice(0, 1);
  return `${first}***@${domain}`;
}

module.exports = {
  formatAddressList,
  maskEmail
};
