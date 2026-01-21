/**
 * EzyBot Embeddable Chat Widget
 * Usage: <script src="https://your-domain.vercel.app/embed.js" data-chat-url="https://your-domain.vercel.app/chat"></script>
 */
(function () {
    'use strict';

    // Get the current script tag to read data attributes
    const currentScript = document.currentScript || document.querySelector('script[src*="embed.js"]');
    const chatUrl = currentScript?.getAttribute('data-chat-url') || 'http://localhost:3000/chat';
    const buttonColor = currentScript?.getAttribute('data-button-color') || '#2563eb';
    const buttonPosition = currentScript?.getAttribute('data-button-position') || 'bottom-right';

    // State
    let isOpen = false;

    // Create styles
    const styleId = 'ezybot-embed-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            #ezybot-chat-button {
                position: fixed;
                ${buttonPosition.includes('bottom') ? 'bottom: 20px;' : 'top: 20px;'}
                ${buttonPosition.includes('right') ? 'right: 20px;' : 'left: 20px;'}
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background: ${buttonColor};
                border: none;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 999999;
                transition: all 0.3s ease;
            }
            #ezybot-chat-button:hover {
                transform: scale(1.1);
                box-shadow: 0 6px 20px rgba(0,0,0,0.2);
            }
            #ezybot-chat-button svg {
                width: 28px;
                height: 28px;
                fill: white;
            }
            #ezybot-chat-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 999998;
                display: none;
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            #ezybot-chat-overlay.open {
                display: block;
                opacity: 1;
            }
            #ezybot-chat-container {
                position: fixed;
                ${buttonPosition.includes('bottom') ? 'bottom: 90px;' : 'top: 90px;'}
                ${buttonPosition.includes('right') ? 'right: 20px;' : 'left: 20px;'}
                width: 400px;
                height: 600px;
                max-width: calc(100vw - 40px);
                max-height: calc(100vh - 120px);
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                z-index: 1000000;
                display: none;
                opacity: 0;
                transform: translateY(20px);
                transition: all 0.3s ease;
                overflow: hidden;
            }
            #ezybot-chat-container.open {
                display: block;
                opacity: 1;
                transform: translateY(0);
            }
            #ezybot-chat-container iframe {
                width: 100%;
                height: 100%;
                border: none;
                border-radius: 12px;
            }
            @media (max-width: 480px) {
                #ezybot-chat-container {
                    width: calc(100vw - 40px);
                    height: calc(100vh - 120px);
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Create button
    const button = document.createElement('button');
    button.id = 'ezybot-chat-button';
    button.setAttribute('aria-label', 'Open chat');
    button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
        </svg>
    `;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'ezybot-chat-overlay';

    // Create container
    const container = document.createElement('div');
    container.id = 'ezybot-chat-container';

    // Create iframe
    const iframe = document.createElement('iframe');
    iframe.src = chatUrl;
    iframe.allow = 'clipboard-write';
    iframe.title = 'EzyBot Chat';

    container.appendChild(iframe);

    // Toggle function
    function toggleChat() {
        isOpen = !isOpen;
        if (isOpen) {
            overlay.classList.add('open');
            container.classList.add('open');
            button.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
            `;
        } else {
            overlay.classList.remove('open');
            container.classList.remove('open');
            button.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                </svg>
            `;
        }
    }

    // Event listeners
    button.addEventListener('click', toggleChat);
    overlay.addEventListener('click', toggleChat);

    // Append to DOM when ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            document.body.appendChild(button);
            document.body.appendChild(overlay);
            document.body.appendChild(container);
        });
    } else {
        document.body.appendChild(button);
        document.body.appendChild(overlay);
        document.body.appendChild(container);
    }
})();
