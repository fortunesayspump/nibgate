(function() {
  try {
    const cached = JSON.parse(localStorage.getItem('nibgate-wallet-cache'));
    if (cached && cached.isConnected) {
      if (window.location.pathname === '/') {
        window.location.replace('/explore');
        return;
      }
      
      document.querySelectorAll('[data-wallet-connect]').forEach(el => {
        el.textContent = cached.address;
        el.dataset.connected = 'true';
        if (cached.fullAddress) {
          el.dataset.address = cached.fullAddress;
          window.nibgateWalletAddress = cached.fullAddress;
        }
      });
      document.querySelectorAll('[data-balance-text]').forEach(el => {
        const selected = cached.selectedToken || 'native';
        el.setAttribute('data-native', cached.balance || '0.00 USDC');
        el.setAttribute('data-gateway', cached.gatewayBalance || '0.00 USDC');
        el.setAttribute('data-selected-token', selected);
        el.textContent = el.getAttribute('data-' + selected);
      });
      document.querySelectorAll('[data-wallet-dropdown]').forEach(dropdown => {
        dropdown.innerHTML = `
          <a href="/dashboard" class="dropdown-item">Dashboard</a>
          <button type="button" class="dropdown-item dropdown-disconnect" data-wallet-disconnect>Disconnect</button>
        `;
      });
      document.querySelectorAll('[data-balance-dropdown]').forEach(dropdown => {
        dropdown.classList.add('nibgate-wallet-dropdown');
        dropdown.innerHTML = `
          <button type="button" class="dropdown-item" data-token-select="native" style="font-weight: 500; color: var(--nib-teal);">ARC Testnet</button>
          <button type="button" class="dropdown-item" data-token-select="gateway" style="font-weight: 500;">Gateway</button>
        `;
      });
    }
  } catch(e) {}
})();

import { createWeb3Modal, defaultConfig } from 'https://esm.sh/@web3modal/ethers5@4.1.11?bundle';
import { ethers } from 'https://esm.sh/ethers@5.7.2';

let modal;

function initWalletConnect() {
  const projectId = '09580756f3c5f13c5f1aeb2faa9b1696';
  
  const arcTestnet = {
    chainId: 5042002,
    name: 'Arc Testnet',
    currency: 'USDC',
    explorerUrl: 'https://testnet.arcscan.app',
    rpcUrl: 'https://rpc.testnet.arc.network'
  };

  const metadata = {
    name: 'Nibgate',
    description: 'Nibgate Creator Platform',
    url: window.location.origin,
    icons: [window.location.origin + '/favicon.ico']
  };

  modal = createWeb3Modal({
    ethersConfig: defaultConfig({ 
      metadata,
      enableEIP6963: true,
      enableInjected: true,
      enableCoinbase: true,
      enableWalletConnect: false,
    }),
    chains: [arcTestnet],
    projectId,
    themeMode: 'light',
    themeVariables: {
      '--w3m-accent': '#7C9A6D',
      '--w3m-color-mix': '#E7EFE4',
      '--w3m-color-mix-strength': 15,
      '--w3m-font-family': '"Kumbh Sans", "ABC Favorit", sans-serif',
      '--w3m-border-radius-master': '4px',
      '--w3m-container-border-radius': '8px',
    }
  });

  // Track if user explicitly clicked connect
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-wallet-connect]') && e.target.closest('[data-wallet-connect]').dataset.connected !== 'true') {
      sessionStorage.setItem('nibgate-wants-redirect', 'true');
    }
  });

  // Subscribe to connection state
  if (modal.subscribeProvider) {
    modal.subscribeProvider(async (state) => {
      const isConnected = state.isConnected;
      const address = state.address;
      if (address) window.nibgateWalletAddress = address;
      
      // --- SIWE AUTHENTICATION FLOW ---
      if (isConnected && address && !window.nibgateAuthenticated) {
        try {
          // Check if already authenticated via secure cookie
          const meRes = await fetch('/api/auth/me');
          const meText = await meRes.text();
          let meData;
          try { meData = JSON.parse(meText); } catch(e) { throw new Error('GET /api/auth/me returned: ' + meText.slice(0, 100)); }
          
          if (meData.authenticated) {
            window.nibgateAuthenticated = true;
          } else {
            // Request Nonce
            const nonceRes = await fetch('/api/auth/nonce');
            const nonceText = await nonceRes.text();
            let nonceData;
            try { nonceData = JSON.parse(nonceText); } catch(e) { throw new Error('GET /api/auth/nonce returned: ' + nonceText.slice(0, 100)); }
            const { messageTemplate } = nonceData;
            
            // Request Signature
            const walletProvider = modal.getWalletProvider();
            const ethersProvider = new ethers.providers.Web3Provider(walletProvider);
            const signer = ethersProvider.getSigner();
            const signature = await signer.signMessage(messageTemplate);
            
            // Verify Signature
            const verifyRes = await fetch('/api/auth/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ walletAddress: address, signature })
            });
            
            if (verifyRes.ok) {
              window.nibgateAuthenticated = true;
            } else {
              throw new Error('Verification failed');
            }
          }
        } catch (err) {
          console.error('SIWE Auth Failed:', err);
          if (modal.disconnect) modal.disconnect();
          return; // Stop UI update
        }
      }
      if (!isConnected) {
        window.nibgateAuthenticated = false;
      }
      // --- END SIWE FLOW ---
      
      // Redirect Logic
      if (isConnected) {
        const wantsRedirect = sessionStorage.getItem('nibgate-wants-redirect') === 'true';
        if (wantsRedirect) {
          sessionStorage.removeItem('nibgate-wants-redirect');
          if (window.location.pathname !== '/explore' && !window.location.pathname.startsWith('/dashboard')) {
            window.location.href = '/explore';
            return;
          }
        } else if (window.location.pathname === '/') {
          window.location.replace('/explore');
          return;
        }
      }
      
      // Handle Connect Wallet container
      document.querySelectorAll('[data-wallet-container]').forEach(container => {
        const button = container.querySelector('[data-wallet-connect]');
        const dropdown = container.querySelector('[data-wallet-dropdown]');
        
        if (isConnected && address) {
          button.textContent = address.slice(0, 6) + '...' + address.slice(-4);
          button.dataset.connected = 'true';
          button.dataset.address = address;
          if (dropdown) dropdown.innerHTML = `
            <a href="/dashboard" class="dropdown-item">Dashboard</a>
            <button type="button" class="dropdown-item dropdown-disconnect" data-wallet-disconnect>Disconnect</button>
          `;
        } else {
          button.textContent = 'Connect wallet';
          button.dataset.connected = 'false';
          if (dropdown) dropdown.innerHTML = ''; // Hide dropdown by clearing it when disconnected
        }
      });

      // Handle Balance container (Always visible)
      const balanceContainers = document.querySelectorAll('[data-balance-container]');
      
      // Update Profile Page Data
      const profileDisconnected = document.querySelector('[data-profile-status="disconnected"]');
      const profileConnected = document.querySelector('[data-profile-status="connected"]');
      const profileAddress = document.querySelector('[data-profile-address]');
      const profileNetwork = document.querySelector('[data-profile-network]');
      const profileBalance = document.querySelector('[data-profile-balance]');
      
      if (isConnected && address && modal.getWalletProvider) {
        if (profileDisconnected) profileDisconnected.style.display = 'none';
        if (profileConnected) profileConnected.style.display = 'block';
        if (profileAddress) profileAddress.textContent = address;
        
        try {
          const walletProvider = modal.getWalletProvider();
          if (walletProvider) {
            const ethersProvider = new ethers.providers.Web3Provider(walletProvider);
            const rawBalance = await ethersProvider.getBalance(address);
            const formattedBalance = ethers.utils.formatEther(rawBalance);
            const numBalance = parseFloat(formattedBalance);
            const roundedBalance = new Intl.NumberFormat('en-US', {
              notation: "compact",
              maximumFractionDigits: 2
            }).format(numBalance);
            
            // Fetch real Gateway Balance from Circle Contract on Arc Testnet
            let numGatewayBalance = 0;
            try {
              const GATEWAY_WALLET_ADDRESS = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
              const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
              const GATEWAY_ABI = ["function availableBalance(address token, address depositor) view returns (uint256)"];
              // Force the use of Arc Testnet RPC directly so it never fails if the user's wallet is out of sync or on the wrong chain
              const arcProvider = new ethers.providers.JsonRpcProvider('https://rpc.testnet.arc.network');
              const gatewayContract = new ethers.Contract(GATEWAY_WALLET_ADDRESS, GATEWAY_ABI, arcProvider);
              const rawGatewayBalance = await gatewayContract.availableBalance(USDC_ADDRESS, address);
              numGatewayBalance = parseFloat(ethers.utils.formatUnits(rawGatewayBalance, 6)); // USDC has 6 decimals
            } catch (e) {
              console.error("Gateway fetch failed, defaulting to 0", e);
            }
            
            const gatewayBalance = new Intl.NumberFormat('en-US', {
              notation: "compact",
              maximumFractionDigits: 2
            }).format(numGatewayBalance);
            
            if (profileBalance) profileBalance.textContent = roundedBalance + ' USDC';
            if (profileNetwork) profileNetwork.textContent = 'Arc Testnet';
            
            balanceContainers.forEach(container => {
              const textEl = container.querySelector('[data-balance-text]');
              if (textEl) {
                textEl.setAttribute('data-native', roundedBalance + ' USDC');
                textEl.setAttribute('data-gateway', gatewayBalance + ' USDC');
                
                const selected = textEl.getAttribute('data-selected-token') || 'native';
                textEl.textContent = textEl.getAttribute('data-' + selected);
                
                // Update cache
                try {
                  localStorage.setItem('nibgate-wallet-cache', JSON.stringify({
                    isConnected: true,
                    address: address.slice(0, 6) + '...' + address.slice(-4),
                    fullAddress: address,
                    balance: roundedBalance + ' USDC',
                    gatewayBalance: gatewayBalance + ' USDC',
                    selectedToken: selected
                  }));
                } catch(e) {}
                
                const dropdown = container.querySelector('[data-balance-dropdown]');
                if (dropdown) {
                  dropdown.classList.add('nibgate-wallet-dropdown');
                  dropdown.innerHTML = `
                    <button type="button" class="dropdown-item" data-token-select="native">ARC Testnet</button>
                    <button type="button" class="dropdown-item" data-token-select="gateway">Gateway</button>
                  `;
                  // Highlight active dropdown item
                  dropdown.querySelectorAll('[data-token-select]').forEach(btn => {
                    if (btn.dataset.tokenSelect === selected) {
                      btn.style.fontWeight = '500';
                      btn.style.color = 'var(--nib-teal)';
                    } else {
                      btn.style.fontWeight = '500';
                      btn.style.color = '';
                    }
                  });
                }
              }
            });
          }
        } catch (err) {
          console.error("Failed to fetch balance:", err);
        }
      } else {
        if (profileDisconnected) profileDisconnected.style.display = 'block';
        if (profileConnected) profileConnected.style.display = 'none';
        
        try {
          localStorage.removeItem('nibgate-wallet-cache');
        } catch(e) {}
        
        balanceContainers.forEach(container => {
          const textEl = container.querySelector('[data-balance-text]');
          if (textEl) {
            textEl.textContent = '0.00 USDC';
          }
          const dropdown = container.querySelector('[data-balance-dropdown]');
          if (dropdown) {
            dropdown.innerHTML = ''; // Clear contents
            dropdown.classList.remove('nibgate-wallet-dropdown'); // Prevent CSS hover
          }
        });
      }
    });
  }

  // Set up event delegation since DOM is rewritten
  document.addEventListener('click', async function(e) {
    const target = e.target.closest('button, a');
    if (!target) return;
    
    if (target.hasAttribute('data-wallet-connect')) {
      e.preventDefault();
      if (target.dataset.connected !== 'true') {
        if (modal) modal.open();
      } else {
        let fullAddress = window.nibgateWalletAddress || target.dataset.address || target.getAttribute('data-address');
        
        // If it's missing or truncated, ask Ethers.js directly!
        if (!fullAddress || fullAddress.includes('...')) {
          try {
            if (modal && modal.getWalletProvider) {
              const wp = modal.getWalletProvider();
              if (wp) {
                const provider = new ethers.providers.Web3Provider(wp);
                fullAddress = await provider.getSigner().getAddress();
                window.nibgateWalletAddress = fullAddress; // Save it
              }
            }
          } catch(err) {
            console.error("Failed to extract full address from provider", err);
          }
        }
        
        if (fullAddress && !fullAddress.includes('...')) {
          console.log("Copying address:", fullAddress);
          const copyFallback = () => {
            const textArea = document.createElement("textarea");
            textArea.value = fullAddress;
            document.body.appendChild(textArea);
            textArea.select();
            try { document.execCommand("copy"); } catch (err) { console.error("Fallback copy failed", err); }
            document.body.removeChild(textArea);
          };

          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(fullAddress).catch(err => {
              console.error("Clipboard API failed, using fallback", err);
              copyFallback();
            });
          } else {
            copyFallback();
          }

          const originalText = target.dataset.originalText || target.textContent;
          target.dataset.originalText = originalText;
          
          // Lock the exact pixel width so the button doesn't shrink when the text gets shorter
          const currentWidth = target.offsetWidth;
          target.style.width = currentWidth + 'px';
          
          target.textContent = "Copied!";
          setTimeout(() => {
            if (target.textContent === "Copied!") {
              target.textContent = target.dataset.originalText;
              target.style.width = ''; // Release the lock
            }
          }, 1500);
        }
      }
    } else if (target.hasAttribute('data-wallet-disconnect')) {
      e.preventDefault();
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch(e) {}
      window.nibgateAuthenticated = false;
      if (modal && modal.disconnect) modal.disconnect();
    } else if (target.hasAttribute('data-token-select')) {
      e.preventDefault();
      const token = target.dataset.tokenSelect;
      
      // Sync across all balance containers (desktop/mobile)
      document.querySelectorAll('[data-balance-container]').forEach(bContainer => {
        const textEl = bContainer.querySelector('[data-balance-text]');
        if (textEl) {
          textEl.setAttribute('data-selected-token', token);
          textEl.textContent = textEl.getAttribute('data-' + token) || '0.00 USDC';
          
          // Instantly update cache with new selected token
          try {
            const cached = JSON.parse(localStorage.getItem('nibgate-wallet-cache') || '{}');
            cached.selectedToken = token;
            localStorage.setItem('nibgate-wallet-cache', JSON.stringify(cached));
          } catch(e) {}
        }
        bContainer.querySelectorAll('[data-token-select]').forEach(btn => {
          if (btn.dataset.tokenSelect === token) {
            btn.style.fontWeight = '500';
            btn.style.color = 'var(--nib-teal)';
          } else {
            btn.style.fontWeight = '500';
            btn.style.color = '';
          }
        });
      });
    }
  });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initWalletConnect);
} else {
  initWalletConnect();
}
