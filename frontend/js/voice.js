// =====================================================================
// CivicSphere Karnataka - Multilingual AI Voice Assistant
// Supports English, Kannada (ಕನ್ನಡ), and Hindi (हिंदी)
// Web Speech Recognition + SpeechSynthesis Audio Output + Voice Actions
// =====================================================================

export const VoiceState = {
  isListening: false,
  isSpeaking: false,
  isMuted: false,
  lang: 'en-IN',
  recognition: null,
  synth: typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null,
  currentUtterance: null,
  hasSpeechSupport: false
};

export function checkSpeechSupport() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  VoiceState.hasSpeechSupport = !!SpeechRecognition;
  return VoiceState.hasSpeechSupport;
}

export function initVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Web Speech Recognition API not supported in this browser.');
    return null;
  }

  const rec = new SpeechRecognition();
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.lang = VoiceState.lang;

  rec.onstart = () => {
    VoiceState.isListening = true;
    updateVoiceUI();
  };

  rec.onresult = (event) => {
    let interim = '';
    let final = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        final += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }

    const currentText = final || interim;
    updateVoiceTranscript(currentText, !final);

    if (final) {
      handleVoiceCommand(final.trim());
    }
  };

  rec.onerror = (event) => {
    console.warn('Voice recognition error:', event.error);
    VoiceState.isListening = false;
    updateVoiceUI();
    if (event.error === 'not-allowed') {
      showVoiceToast('⚠️ Microphone access was blocked. Please allow mic permissions in your browser.');
    } else if (event.error === 'no-speech') {
      showVoiceToast('Microphone heard no speech. Please tap mic and speak again.');
    }
  };

  rec.onend = () => {
    VoiceState.isListening = false;
    updateVoiceUI();
  };

  VoiceState.recognition = rec;
  return rec;
}

export function startVoiceListening() {
  stopVoiceSpeaking();

  if (!VoiceState.recognition) {
    initVoiceRecognition();
  }

  if (!VoiceState.recognition) {
    showVoiceToast('Voice input is not supported in this browser. You can type in the assistant box!');
    openVoiceModal();
    return;
  }

  try {
    VoiceState.recognition.lang = VoiceState.lang;
    VoiceState.recognition.start();
    openVoiceModal();
  } catch (err) {
    console.warn('Recognition start caught:', err);
  }
}

export function stopVoiceListening() {
  if (VoiceState.recognition && VoiceState.isListening) {
    try {
      VoiceState.recognition.stop();
    } catch (e) {}
  }
  VoiceState.isListening = false;
  updateVoiceUI();
}

export function toggleVoiceListening() {
  if (VoiceState.isListening) {
    stopVoiceListening();
  } else {
    startVoiceListening();
  }
}

export function stopVoiceSpeaking() {
  if (VoiceState.synth) {
    VoiceState.synth.cancel();
  }
  VoiceState.isSpeaking = false;
  updateVoiceUI();
}

export function speakText(text, lang = VoiceState.lang) {
  if (VoiceState.isMuted || !VoiceState.synth) return;

  stopVoiceSpeaking();

  const clean = text
    .replace(/<[^>]*>/g, '')
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/[*_#`~]/g, '')
    .trim();

  if (!clean) return;

  const utter = new SpeechSynthesisUtterance(clean);
  utter.rate = 1.02;
  utter.pitch = 1.0;
  utter.lang = lang;

  const voices = VoiceState.synth.getVoices();
  if (voices && voices.length > 0) {
    if (lang.startsWith('kn')) {
      const knVoice = voices.find((v) => v.lang.includes('kn') || v.lang.includes('KN'));
      if (knVoice) utter.voice = knVoice;
    } else if (lang.startsWith('hi')) {
      const hiVoice = voices.find((v) => v.lang.includes('hi') || v.lang.includes('HI'));
      if (hiVoice) utter.voice = hiVoice;
    } else {
      const inVoice = voices.find((v) => v.lang.includes('en-IN') || v.name.includes('India'));
      if (inVoice) utter.voice = inVoice;
    }
  }

  utter.onstart = () => {
    VoiceState.isSpeaking = true;
    updateVoiceUI();
  };

  utter.onend = () => {
    VoiceState.isSpeaking = false;
    updateVoiceUI();
  };

  utter.onerror = () => {
    VoiceState.isSpeaking = false;
    updateVoiceUI();
  };

  VoiceState.currentUtterance = utter;
  VoiceState.synth.speak(utter);
}

export function handleVoiceCommand(rawQuery) {
  const q = rawQuery.toLowerCase();
  let replySpeech = '';
  let botText = '';

  if (
    q.includes('report') || q.includes('pothole') || q.includes('garbage') ||
    q.includes('leakage') || q.includes('street light') || q.includes('hazard') ||
    q.includes('ದೂರು') || q.includes('ಗುಂಡಿ') || q.includes('ಕಸ') || q.includes('ಫಿರ್ಯಾದು') ||
    q.includes('शिकायत') || q.includes('गड्ढा') || q.includes('कचरा')
  ) {
    window.location.hash = '#report';
    if (window.navigateTo) window.navigateTo('report');

    let cleanDesc = rawQuery.replace(/^(i want to report|please report|report|complaint|ದೂರು|शिकायत)/i, '').trim();
    if (!cleanDesc || cleanDesc.length < 5) cleanDesc = rawQuery;

    setTimeout(() => {
      const descInput = document.getElementById('report-desc');
      if (descInput) {
        descInput.value = cleanDesc;
        descInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, 200);

    if (VoiceState.lang.startsWith('kn')) {
      replySpeech = `ದೂರು ದಾಖಲಿಸುವ ವಿಭಾಗವನ್ನು ತೆರೆಯಲಾಗಿದೆ. ನಿಮ್ಮ ವಿವರವನ್ನು ಸೇರಿಸಲಾಗಿದೆ: ${cleanDesc}`;
      botText = `✅ ದೂರು ದಾಖಲಿಸುವ ವಿಭಾಗವನ್ನು ತೆರೆಯಲಾಗಿದೆ: "${cleanDesc}".`;
    } else if (VoiceState.lang.startsWith('hi')) {
      replySpeech = `शिकायत दर्ज करने का पेज खोल दिया गया है। आपका विवरण जोड़ दिया गया है।`;
      botText = `✅ रिपोर्ट पेज खुल गया है: "${cleanDesc}".`;
    } else {
      replySpeech = `Opening Report Issue wizard for you. I have captured your issue: ${cleanDesc}`;
      botText = `✅ Navigated to Report Wizard with your issue description: "${cleanDesc}".`;
    }
  } else if (
    q.includes('track') || q.includes('status') || q.includes('where is my complaint') ||
    q.includes('ಟ್ರ್ಯಾಕ್') || q.includes('ಸ್ಥಿತಿ') ||
    q.includes('ट्रैक') || q.includes('स्थिति')
  ) {
    window.location.hash = '#track';
    if (window.navigateTo) window.navigateTo('track');

    const digitsMatch = rawQuery.match(/(?:cmp-?|wo-?)?(\d{4,10})/i);
    if (digitsMatch) {
      const idQuery = digitsMatch[0].toUpperCase();
      setTimeout(() => {
        if (window.fillTrackSearch) window.fillTrackSearch(idQuery);
      }, 300);
      replySpeech = `Looking up tracking status for incident ${idQuery}.`;
      botText = `🔍 Searching status for incident **${idQuery}**...`;
    } else {
      replySpeech = `Opening Incident Tracker. You can enter or speak your complaint number or phone number.`;
      botText = `🔍 Incident Tracker opened. Please enter your complaint ID or mobile number.`;
    }
  } else if (
    q.includes('map') || q.includes('live map') || q.includes('bengaluru map') ||
    q.includes('ನಕ್ಷೆ') || q.includes('ಮ್ಯಾಪ್') ||
    q.includes('नक्शा') || q.includes('मैप')
  ) {
    window.location.hash = '#map';
    if (window.navigateTo) window.navigateTo('map');
    replySpeech = `Switching to Karnataka Real-World Civic Operations Map.`;
    botText = `🗺️ Navigated to Karnataka Live Operations Map.`;
  } else if (
    q.includes('officer') || q.includes('work queue') || q.includes('dispatch queue') ||
    q.includes('ಅಧಿಕಾರಿ') || q.includes('अधिकारी')
  ) {
    window.location.hash = '#officer';
    if (window.navigateTo) window.navigateTo('officer');
    replySpeech = `Opening Field Officer Work Order Dispatch Desk.`;
    botText = `👷 Navigated to Officer Work Queue.`;
  } else if (
    q.includes('dashboard') || q.includes('command') || q.includes('analytics') || q.includes('stats')
  ) {
    window.location.hash = '#dashboard';
    if (window.navigateTo) window.navigateTo('dashboard');
    replySpeech = `Opening Municipal Command Centre and SLA compliance analytics.`;
    botText = `📊 Opened Command Centre Analytics.`;
  } else if (
    q.includes('emergency') || q.includes('helpline') || q.includes('phone') || q.includes('call') ||
    q.includes('ಸಹಾಯವಾಣಿ') || q.includes('हेल्पलाइन')
  ) {
    replySpeech = `BBMP Municipal 24/7 Helpline is 1902. BESCOM Power Helpline is 1912. BWSSB Water Supply is 1916. Karnataka Emergency Services is 112.`;
    botText = `📞 **Official Karnataka Civic Helplines:**\n• **BBMP Civic:** 1902\n• **BESCOM Electricity:** 1912\n• **BWSSB Water:** 1916\n• **Emergency Police/Ambulance:** 112`;
  } else if (q.includes('pothole') || q.includes('how long') || q.includes('sla')) {
    replySpeech = `Under Karnataka citizen charter, critical potholes are patched within 4 to 24 hours. Normal road maintenance is resolved within 48 to 72 hours.`;
    botText = `⏱️ **Pothole SLA:**\n• **P1 Critical:** 4 - 24 Hours\n• **P2 High:** 24 - 48 Hours\n• **P3 Standard:** Up to 72 Hours`;
  } else {
    replySpeech = `I am CivicSphere AI Voice Assistant. You can tell me to report an issue, track your complaint, open the live map, or check BBMP SLAs.`;
    botText = `🤖 **CivicSphere Voice Assistant:**\nI can help you:\n1. *"Report pothole on 100ft road Indiranagar"*\n2. *"Track complaint CMP-1004"*\n3. *"Show live map"*\n4. *"Call 1902 helpline"*`;
  }

  if (window.addVoiceChatMessage) {
    window.addVoiceChatMessage(rawQuery, botText);
  }

  speakText(replySpeech, VoiceState.lang);
}

function updateVoiceUI() {
  const navBtn = document.querySelector('.voice-assistant-nav-btn');
  if (navBtn) {
    if (VoiceState.isListening) {
      navBtn.classList.add('listening');
      navBtn.classList.remove('speaking');
    } else if (VoiceState.isSpeaking) {
      navBtn.classList.add('speaking');
      navBtn.classList.remove('listening');
    } else {
      navBtn.classList.remove('listening', 'speaking');
    }
  }

  const orb = document.getElementById('floating-voice-orb');
  if (orb) {
    if (VoiceState.isListening) {
      orb.classList.add('listening');
      orb.classList.remove('speaking');
    } else if (VoiceState.isSpeaking) {
      orb.classList.add('speaking');
      orb.classList.remove('listening');
    } else {
      orb.classList.remove('listening', 'speaking');
    }
  }

  const banner = document.getElementById('voice-active-banner');
  const statusText = document.getElementById('voice-status-text');
  const micBtn = document.getElementById('chat-mic-btn');

  if (micBtn) {
    micBtn.classList.toggle('active', VoiceState.isListening);
    micBtn.textContent = VoiceState.isListening ? '🛑' : '🎙️';
  }

  if (banner) {
    if (VoiceState.isListening) {
      banner.style.display = 'flex';
      banner.className = 'voice-active-banner listening';
      if (statusText) statusText.textContent = VoiceState.lang.startsWith('kn') ? 'ಕೇಳಿಸಿಕೊಳ್ಳುತ್ತಿದ್ದೇನೆ... ಮಾತನಾಡಿ 🎙️' : VoiceState.lang.startsWith('hi') ? 'सुन रहा हूँ... बोलिए 🎙️' : 'Listening... Speak in English, Kannada, or Hindi 🎙️';
    } else if (VoiceState.isSpeaking) {
      banner.style.display = 'flex';
      banner.className = 'voice-active-banner speaking';
      if (statusText) statusText.textContent = 'Speaking response... 🔊';
    } else {
      banner.style.display = 'none';
    }
  }

  const muteBtn = document.getElementById('voice-mute-toggle-btn');
  if (muteBtn) {
    muteBtn.textContent = VoiceState.isMuted ? '🔇 Muted' : '🔊 Voice On';
    muteBtn.classList.toggle('muted', VoiceState.isMuted);
  }
}

function updateVoiceTranscript(text, isInterim) {
  const statusText = document.getElementById('voice-status-text');
  if (statusText && text) {
    statusText.innerHTML = `🎙️ <i>"${text}"</i> ${isInterim ? '...' : '✅'}`;
  }
}

export function openVoiceModal() {
  const drawer = document.getElementById('chat-drawer');
  if (drawer && !drawer.classList.contains('open')) {
    drawer.classList.add('open');
    if (window.renderChatMessages) window.renderChatMessages();
  }
}

export function toggleVoiceAssistant() {
  openVoiceModal();
  if (!VoiceState.isListening) {
    startVoiceListening();
  } else {
    stopVoiceListening();
  }
}

export function setVoiceLanguage(langCode) {
  VoiceState.lang = langCode;
  if (VoiceState.recognition) {
    VoiceState.recognition.lang = langCode;
  }
  showVoiceToast('Language set to: ' + (langCode === 'kn-IN' ? 'Kannada (ಕನ್ನಡ)' : langCode === 'hi-IN' ? 'Hindi (हिंदी)' : 'English'));
  updateVoiceUI();
}

export function toggleVoiceMute() {
  VoiceState.isMuted = !VoiceState.isMuted;
  if (VoiceState.isMuted) {
    stopVoiceSpeaking();
    showVoiceToast('🔇 Voice audio output muted.');
  } else {
    showVoiceToast('🔊 Voice audio output unmuted.');
    speakText('Voice output is now unmuted.');
  }
  updateVoiceUI();
}

function showVoiceToast(msg) {
  if (window.showToast) {
    window.showToast(msg);
  }
}
