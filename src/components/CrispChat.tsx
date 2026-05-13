'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    $crisp?: Array<unknown>;
    CRISP_WEBSITE_ID?: string;
  }
}

const crispWebsiteId = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID?.trim() || '';
const crispScriptId = 'crisp-chat-script';

export default function CrispChat() {
  useEffect(() => {
    if (!crispWebsiteId) return;

    window.$crisp = window.$crisp || [];
    window.CRISP_WEBSITE_ID = crispWebsiteId;

    if (document.getElementById(crispScriptId)) {
      return;
    }

    const script = document.createElement('script');
    script.id = crispScriptId;
    script.src = 'https://client.crisp.chat/l.js';
    script.async = true;

    document.head.appendChild(script);
  }, []);

  return null;
}
