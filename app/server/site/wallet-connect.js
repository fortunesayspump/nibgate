export function walletConnectScript() {
  return `
    <script>
      (function() {
        try {
          const cached = JSON.parse(localStorage.getItem('nibgate-wallet-cache'));
          if (cached && cached.isConnected) {
            document.querySelectorAll('[data-wallet-connect]').forEach(el => {
              el.textContent = cached.address;
              el.dataset.connected = 'true';
            });
            document.querySelectorAll('[data-balance-text]').forEach(el => {
              el.textContent = cached.balance;
            });
            document.querySelectorAll('[data-wallet-dropdown]').forEach(dropdown => {
              dropdown.innerHTML = \`
                <a href="/dashboard" class="dropdown-item">Dashboard</a>
                <button type="button" class="dropdown-item dropdown-disconnect" data-wallet-disconnect>Disconnect</button>
              \`;
            });
            document.querySelectorAll('[data-balance-dropdown]').forEach(dropdown => {
              dropdown.classList.add('nibgate-wallet-dropdown');
              dropdown.innerHTML = \`
                <button type="button" class="dropdown-item" data-token-select="native">Arc Testnet USDC</button>
                <button type="button" class="dropdown-item" data-token-select="gateway">Gateway</button>
              \`;
            });
          }
        } catch(e) {}
      })();
    </script>
    <script type="module">
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

        // Subscribe to connection state
        if (modal.subscribeProvider) {
          modal.subscribeProvider(async (state) => {
            const isConnected = state.isConnected;
            const address = state.address;
            
            // Handle Connect Wallet container
            document.querySelectorAll('[data-wallet-container]').forEach(container => {
              const button = container.querySelector('[data-wallet-connect]');
              const dropdown = container.querySelector('[data-wallet-dropdown]');
              
              if (isConnected && address) {
                button.textContent = address.slice(0, 6) + '...' + address.slice(-4);
                button.dataset.connected = 'true';
                if (dropdown) dropdown.innerHTML = \`
                  <a href="/dashboard" class="dropdown-item">Dashboard</a>
                  <button type="button" class="dropdown-item dropdown-disconnect" data-wallet-disconnect>Disconnect</button>
                \`;
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
                  const roundedBalance = parseFloat(formattedBalance).toFixed(2);
                  
                  // Mock Gateway Balance until contract is provided
                  const gatewayBalance = "0.00";
                  
                  if (profileBalance) profileBalance.textContent = gatewayBalance + ' Gateway';
                  if (profileNetwork) profileNetwork.textContent = 'Arc Testnet';
                  
                  balanceContainers.forEach(container => {
                    const textEl = container.querySelector('[data-balance-text]');
                    if (textEl) {
                      textEl.setAttribute('data-native', roundedBalance + ' USDC');
                      textEl.setAttribute('data-gateway', gatewayBalance + ' Gateway');
                      
                      const selected = textEl.getAttribute('data-selected-token') || 'native';
                      textEl.textContent = textEl.getAttribute('data-' + selected);
                      
                      // Update cache
                      try {
                        localStorage.setItem('nibgate-wallet-cache', JSON.stringify({
                          isConnected: true,
                          address: address.slice(0, 6) + '...' + address.slice(-4),
                          balance: roundedBalance + ' USDC'
                        }));
                      } catch(e) {}
                      
                      const dropdown = container.querySelector('[data-balance-dropdown]');
                      if (dropdown) {
                        dropdown.classList.add('nibgate-wallet-dropdown');
                        dropdown.innerHTML = \`
                          <button type="button" class="dropdown-item" data-token-select="native">Arc Testnet USDC</button>
                          <button type="button" class="dropdown-item" data-token-select="gateway">Gateway</button>
                        \`;
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
        document.addEventListener('click', function(e) {
          const target = e.target.closest('button, a');
          if (!target) return;
          
          if (target.hasAttribute('data-wallet-connect')) {
            e.preventDefault();
            if (target.dataset.connected !== 'true') {
              if (modal) modal.open();
            }
          } else if (target.hasAttribute('data-wallet-disconnect')) {
            e.preventDefault();
            if (modal && modal.disconnect) modal.disconnect();
          } else if (target.hasAttribute('data-token-select')) {
            e.preventDefault();
            const token = target.dataset.tokenSelect;
            
            // Sync across all balance containers (desktop/mobile)
            document.querySelectorAll('[data-balance-container]').forEach(bContainer => {
              const textEl = bContainer.querySelector('[data-balance-text]');
              if (textEl) {
                textEl.setAttribute('data-selected-token', token);
                textEl.textContent = textEl.getAttribute('data-' + token);
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
        window.addEventListener('load', initWalletConnect);
      } else {
        initWalletConnect();
      }
    </script>
  `;
}
