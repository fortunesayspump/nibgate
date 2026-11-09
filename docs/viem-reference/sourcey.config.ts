import { defineConfig, markdown } from 'sourcey';
export default defineConfig({...{
  "name": "Nibgate · Viem Reference",
  "siteUrl": "https://docs.nibgate.xyz",
  "baseUrl": "/viem-reference",
  "theme": {
    "name": "default",
    "appearance": {
      "default": "light"
    },
    "colors": {
      "primary": "#526a45",
      "light": "#7c9a6d",
      "dark": "#334d28"
    },
    "fonts": {
      "sans": "\"Kumbh Sans\", \"ABC Favorit\", Arial, sans-serif",
      "mono": "system",
      "google": false
    },
    "layout": {
      "sidebar": "17.5rem",
      "toc": "17rem",
      "content": "53.75rem"
    },
    "css": [
      "./brand.css"
    ]
  },
  "navbar": {
    "links": [
      {
        "type": "link",
        "label": "Nibgate docs",
        "href": "https://docs.nibgate.xyz"
      },
      {
        "type": "link",
        "label": "Viem upstream",
        "href": "https://github.com/wevm/viem"
      }
    ]
  },
  "footer": {
    "text": "Independent Viem integration reference maintained by Nibgate. Upstream source: MIT, weth LLC.",
    "links": [
      {
        "type": "link",
        "label": "Viem official docs",
        "href": "https://viem.sh"
      },
      {
        "type": "link",
        "label": "Nibgate",
        "href": "https://nibgate.xyz"
      }
    ]
  }
}, navigation: {tabs:[{tab:'Viem Reference',slug:'',source:markdown({groups:[{"group":"Overview","pages":["pages/introduction","pages/integration","pages/verification"]},{"group":"Clients and Transports","pages":["pages/api/createPublicClient","pages/api/createWalletClient","pages/api/custom","pages/api/fallback","pages/api/http"]},{"group":"ABI Encoding","pages":["pages/api/decodeAbiParameters","pages/api/decodeEventLog","pages/api/decodeFunctionData","pages/api/encodeAbiParameters","pages/api/encodeFunctionData"]},{"group":"Addresses","pages":["pages/api/getAddress","pages/api/getContractAddress","pages/api/isAddress","pages/api/isAddressEqual"]},{"group":"Encoding and Hashing","pages":["pages/api/stringToBytes","pages/api/toHex","pages/api/keccak256"]},{"group":"Signatures","pages":["pages/api/hashMessage","pages/api/hashTypedData","pages/api/recoverMessageAddress"]},{"group":"Units","pages":["pages/api/formatEther","pages/api/formatUnits","pages/api/parseEther","pages/api/parseUnits"]}]})}]}});
