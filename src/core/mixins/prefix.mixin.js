import { isAddress } from '@/core/helpers/addressUtils';

export default {
  name: 'prefix',
  data() {
    return {
      prefix: localStorage.getItem("prefix") || "xdc"
    };
  },
  methods: {
    get0xAddress(address = "") {
      const start = address?.slice(0, 3);
      return start.toLowerCase() === this.prefix ? "0x" + address.substring(3) : address;
    },
    getXDCAddress(address = "") {
      const start = address?.slice(0, 2);
      return start.toLowerCase() === "0x" ? this.prefix + address.substring(2) : address;
    },
    isXDCAddress(address = '') {
      if (this.prefix.toLowerCase() === 'xdc') address = '0x' + address.substring(3);
      return !!address && isAddress(address);
    }
  }
};
