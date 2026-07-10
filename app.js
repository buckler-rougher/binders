// Congressional Hearing Binder Maker
// Integrates with Congress.gov API and generates 3 PDFs

const { jsPDF } = window.jspdf;

// Load Public Sans font for PDFs
let publicSansFontData = {
  normal: null,
  bold: null,
  italic: null
};

async function loadPublicSansFont() {
  if (publicSansFontData.normal) return true;

  try {
    // Fetch Public Sans regular font from GitHub raw content
    const normalUrl = 'https://raw.githubusercontent.com/uswds/public-sans/main/fonts/ttf/PublicSans-Regular.ttf';
    const boldUrl = 'https://raw.githubusercontent.com/uswds/public-sans/main/fonts/ttf/PublicSans-Bold.ttf';
    const italicUrl = 'https://raw.githubusercontent.com/uswds/public-sans/main/fonts/ttf/PublicSans-Italic.ttf';

    const [normalRes, boldRes, italicRes] = await Promise.all([
      fetch(normalUrl),
      fetch(boldUrl),
      fetch(italicUrl)
    ]);

    if (!normalRes.ok || !boldRes.ok || !italicRes.ok) {
      throw new Error('Failed to load one or more font variants');
    }

    publicSansFontData.normal = arrayBufferToBase64(await normalRes.arrayBuffer());
    publicSansFontData.bold = arrayBufferToBase64(await boldRes.arrayBuffer());
    publicSansFontData.italic = arrayBufferToBase64(await italicRes.arrayBuffer());

    return true;
  } catch (err) {
    console.warn('Failed to load Public Sans font, falling back to Helvetica:', err);
    return false;
  }
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const registeredFontsPerDoc = new WeakMap();

// Helper to set Public Sans font if available, otherwise use Helvetica
function setPublicSans(doc, weight = 'normal', style = 'normal') {
  let fontData = null;
  let fontName = 'PublicSans';

  if (weight === 'bold' && style === 'normal') {
    fontData = publicSansFontData.bold;
    fontName = 'PublicSans-Bold';
  } else if (weight === 'normal' && style === 'italic') {
    fontData = publicSansFontData.italic;
    fontName = 'PublicSans-Italic';
  } else if (weight === 'bold' && style === 'italic') {
    fontData = publicSansFontData.italic;
    fontName = 'PublicSans-Italic';
  } else {
    fontData = publicSansFontData.normal;
    fontName = 'PublicSans';
  }

  if (fontData) {
    try {
      if (!registeredFontsPerDoc.has(doc)) registeredFontsPerDoc.set(doc, new Set());
      const registered = registeredFontsPerDoc.get(doc);
      if (!registered.has(fontName)) {
        doc.addFileToVFS(`${fontName}.ttf`, fontData);
        doc.addFont(`${fontName}.ttf`, fontName, 'normal', 'normal');
        registered.add(fontName);
      }
      doc.setFont(fontName);
      return true;
    } catch (err) {
      console.warn('Failed to set Public Sans font:', err);
    }
  }
  doc.setFont('helvetica', weight);
  return false;
}

// API Configuration
let apiKey = localStorage.getItem('congressApiKey') || '';
let useApi = localStorage.getItem('useApi') !== 'false'; // Default to true
let currentCongress = null; // Will be fetched from API

// Initialize API UI
async function initApiUI() {
  const apiSetupSection = document.getElementById('apiSetup');
  const apiIndicator = document.getElementById('apiIndicator');
  const apiConfigFields = document.getElementById('apiConfigFields');
  const searchSection = document.getElementById('searchSection');
  const billSearchSection = document.getElementById('billSearch');
  const searchBillBtn = document.getElementById('searchBill');
  const apiKeyInput = document.getElementById('apiKey');
  const showApiConfigBtn = document.getElementById('showApiConfig');

  if (apiKey) apiKeyInput.value = apiKey;

  // All UI updates run synchronously before any async work to avoid race conditions
  if (!useApi) {
    apiConfigFields.style.display = 'none';
    searchSection.style.display = 'none';
    apiIndicator.style.display = 'block';
    showApiConfigBtn.textContent = 'Configure API';
    searchBillBtn.style.display = 'none';
  } else {
    searchSection.style.display = 'block';
    searchBillBtn.style.display = 'block';
  }

  if (apiKey && useApi) {
    apiSetupSection.style.display = 'none';
    apiIndicator.style.display = 'block';
    showApiConfigBtn.textContent = 'API Settings';
    searchBillBtn.style.display = 'block';
  } else if (!apiKey) {
    apiSetupSection.style.display = 'block';
    apiIndicator.style.display = 'none';
    searchBillBtn.style.display = 'none';
  } else {
    apiIndicator.style.display = 'block';
    showApiConfigBtn.textContent = 'Configure API';
    searchBillBtn.style.display = 'none';
  }

  // Fetch current congress in background — only sets currentCongress variable, no UI changes
  if (apiKey) await fetchCurrentCongress();
}

// Fetch current congress from API
async function fetchCurrentCongress() {
  if (!apiKey) return;

  try {
    const url = `https://api.congress.gov/v3/congress/current?api_key=${apiKey}&format=json`;
    const response = await fetch(url);
    if (!response.ok) return;

    const data = await response.json();
    if (data.congresses && data.congresses.length > 0) {
      currentCongress = data.congresses[0].congressNumber;
    }
  } catch {
    // If fetch fails, default to null (will use fallback)
  }
}

// Handle API opt-out button
document.getElementById('optOutApi').addEventListener('click', () => {
  useApi = false;
  localStorage.setItem('useApi', false);
  document.getElementById('apiSetup').style.display = 'none';
  document.getElementById('apiIndicator').style.display = 'block';
  document.getElementById('showApiConfig').textContent = 'Configure API';
  document.getElementById('searchSection').style.display = 'none';
  document.getElementById('searchBill').style.display = 'none';
});

// Show API config button
document.getElementById('showApiConfig').addEventListener('click', () => {
  document.getElementById('apiSetup').style.display = 'block';
  document.getElementById('apiIndicator').style.display = 'none';
});

// Hide API config button (X)
document.getElementById('closeApiConfig').addEventListener('click', () => {
  document.getElementById('apiSetup').style.display = 'none';
  document.getElementById('apiIndicator').style.display = 'block';
});

// Copy API key
document.getElementById('copyApiKey').addEventListener('click', () => {
  const apiKeyInput = document.getElementById('apiKey');
  navigator.clipboard.writeText(apiKeyInput.value).then(() => {
    showMessage('API key copied to clipboard', 'success');
  }).catch(() => {
    showMessage('Failed to copy API key', 'error');
  });
});

// Save API key
document.getElementById('saveApiKey').addEventListener('click', async () => {
  const key = document.getElementById('apiKey').value.trim();
  if (key) {
    localStorage.setItem('congressApiKey', key);
    apiKey = key;
    useApi = true;
    localStorage.setItem('useApi', true);
    showMessage('API key saved', 'success');
    // Fetch current congress
    await fetchCurrentCongress();
    // Hide setup and show indicator
    document.getElementById('apiSetup').style.display = 'none';
    document.getElementById('apiIndicator').style.display = 'block';
    document.getElementById('showApiConfig').textContent = 'API Settings';
    document.getElementById('searchSection').style.display = 'block';
    document.getElementById('searchBill').style.display = 'block';
  }
});

// Initialize on load
initApiUI();

// Show message helper
function showMessage(msg, type = 'error') {
  const existing = document.querySelector('.message');
  if (existing) existing.remove();
  
  const div = document.createElement('div');
  div.className = `message ${type}`;
  div.textContent = msg;
  div.style.cssText = `
    padding: 12px 16px;
    margin: 12px 0;
    border-radius: 6px;
    font-size: 14px;
    ${type === 'error' ? 'background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;' : 'background: #f0fdf4; color: #059669; border: 1px solid #bbf7d0;'}
  `;
  
  const searchSection = document.querySelector('.search-section');
  searchSection.insertBefore(div, document.getElementById('searchResults'));
  
  setTimeout(() => div.remove(), 5000);
}

// Check URL parameters for API key
const urlParams = new URLSearchParams(window.location.search);
const urlApiKey = urlParams.get('api');
if (urlApiKey) {
  apiKey = urlApiKey;
  localStorage.setItem('congressApiKey', apiKey);
  useApi = true;
  localStorage.setItem('useApi', true);
  // Remove api param from URL without reloading
  urlParams.delete('api');
  const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
  window.history.replaceState({}, '', newUrl);
  // Close API configuration pane
  document.getElementById('apiSetup').style.display = 'none';
  document.getElementById('apiIndicator').style.display = 'block';
  document.getElementById('showApiConfig').textContent = 'API Settings';
}

// Fetch committee meetings from Congress.gov API
document.getElementById('searchBtn').addEventListener('click', async () => {
  if (!apiKey) {
    showMessage('Please enter your Congress.gov API key first');
    return;
  }
  
  const chamber = document.getElementById('chamber').value;
  const dateInput = document.getElementById('meetingDate').value;
  
  if (!chamber || !dateInput) {
    showMessage('Please select both Chamber and Date');
    return;
  }
  
  // Use fetched current congress or fallback to 119
  const congress = currentCongress || '119';
  
  const btn = document.getElementById('searchBtn');
  btn.innerHTML = '<span class="loading"></span> Loading...';
  btn.disabled = true;
  
  try {
    const url = `https://api.congress.gov/v3/committee-meeting/${congress}/${chamber}?api_key=${apiKey}&format=json&limit=250&sort=meetingDate&sortOrder=desc`;

    console.log('Fetching recent meetings:', url);
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    console.log('API response:', data);
    
    // committee-meeting returns { committeeMeetings: [...] }
    let meetings = [];
    if (data.committeeMeetings && Array.isArray(data.committeeMeetings)) {
      meetings = data.committeeMeetings;
    } else if (data.meetings && Array.isArray(data.meetings)) {
      meetings = data.meetings;
    } else if (Array.isArray(data)) {
      meetings = data;
    }
    
    console.log(`Found ${meetings.length} meetings`);
    console.log('Meeting titles:', meetings.map(m => m.title || m.meeting?.title));

    if (meetings.length === 0) {
      showMessage('No meetings found. Please check your API key and try again.', 'error');
      btn.innerHTML = 'Load Meetings';
      btn.disabled = false;
      return;
    }
    
    // Fetch details and show meetings - let user pick the date they want
    await displayResults(meetings, congress, chamber);
    
  } catch (err) {
    showMessage(`Failed to load meetings: ${err.message}`);
  } finally {
    btn.innerHTML = 'Load Meetings';
    btn.disabled = false;
  }
});

// Store all loaded meetings for client-side filtering
let loadedMeetings = [];
let meetingMaterials = []; // Store PDF links from selected meeting

// Save current state to localStorage
function saveState() {
  const state = {
    loadedMeetings: loadedMeetings,
    tocItems: tocItems,
    customTabText: customTabText,
    meetingMaterials: meetingMaterials,
    formData: {
      committee: document.getElementById('committee').value,
      hearingTitle: document.getElementById('hearingTitle').value,
      hearingDate: document.getElementById('hearingDate').value,
      hearingTime: document.getElementById('hearingTime').value,
      location: document.getElementById('location').value,
      meetingType: document.getElementById('meetingType').value
    },
    chamber: document.getElementById('chamber').value,
    meetingDate: document.getElementById('meetingDate').value
  };
  localStorage.setItem('hearingBinderState', JSON.stringify(state));
}

// Restore state from localStorage
function restoreState() {
  const saved = localStorage.getItem('hearingBinderState');
  if (!saved) return false;

  try {
    const state = JSON.parse(saved);

    // Restore meetings
    if (state.loadedMeetings && state.loadedMeetings.length > 0) {
      loadedMeetings = state.loadedMeetings;
      renderMeetings(loadedMeetings);
      populateCommitteeFilter(loadedMeetings);
      document.querySelector('.filter-controls').style.display = 'block';
    }

    // Restore TOC
    if (state.tocItems && state.tocItems.length > 0) {
      tocItems = state.tocItems;
    }

    // Restore custom tab text
    if (state.customTabText) {
      customTabText = state.customTabText;
    }

    // Restore meeting materials
    if (state.meetingMaterials) {
      meetingMaterials = state.meetingMaterials;
      renderMaterialsButtons();
    }

    if (state.tocItems && state.tocItems.length > 0) {
      renderTocList();
      updateTabsPreview();
    }

    // Restore form fields
    if (state.formData) {
      document.getElementById('committee').value = state.formData.committee || '';
      document.getElementById('hearingTitle').value = state.formData.hearingTitle || '';
      document.getElementById('hearingDate').value = state.formData.hearingDate || '';
      document.getElementById('hearingTime').value = state.formData.hearingTime || '';
      document.getElementById('location').value = state.formData.location || '';
      document.getElementById('meetingType').value = state.formData.meetingType || 'hearing';
    }

    // Restore search params
    if (state.chamber) document.getElementById('chamber').value = state.chamber;
    if (state.meetingDate) document.getElementById('meetingDate').value = state.meetingDate;

    return true;
  } catch {
    return false;
  }
}

// Clear all data except API key, tab template, binder count, and paper size
function clearAllData() {
  // Clear in-memory data
  loadedMeetings = [];
  tocItems = [];
  customTabText = {};
  meetingMaterials = [];

  // Clear form fields
  document.getElementById('committee').value = '';
  document.getElementById('hearingTitle').value = '';
  document.getElementById('hearingDate').value = '';
  document.getElementById('hearingTime').value = '';
  document.getElementById('location').value = '';
  document.getElementById('chamber').value = 'house';
  document.getElementById('meetingDate').value = '';
  document.getElementById('meetingType').value = 'hearing';
  updateTitleLabel();

  // Clear localStorage state (but keep API key, useApi, and preferences)
  const currentApiKey = localStorage.getItem('congressApiKey');
  const currentUseApi = localStorage.getItem('useApi');
  const currentTabTemplate = localStorage.getItem('tabTemplate');
  const currentBinderCount = localStorage.getItem('binderCount');
  const currentPaperSize = localStorage.getItem('paperSize');

  localStorage.removeItem('hearingBinderState');

  // Restore API key and preferences
  if (currentApiKey) localStorage.setItem('congressApiKey', currentApiKey);
  if (currentUseApi) localStorage.setItem('useApi', currentUseApi);
  if (currentTabTemplate) localStorage.setItem('tabTemplate', currentTabTemplate);
  if (currentBinderCount) localStorage.setItem('binderCount', currentBinderCount);
  if (currentPaperSize) localStorage.setItem('paperSize', currentPaperSize);

  // Clear UI
  renderMeetings([]);
  renderTocList();
  updateTabsPreview();
  renderMaterialsButtons();
  document.querySelector('.filter-controls').style.display = 'none';

  showMessage('All data cleared', 'success');
}

// Display committee meetings
async function displayResults(meetings, congress, chamber) {
  const container = document.getElementById('searchResults');
  container.innerHTML = '<div class="hearing-result"><p><span class="loading"></span> Loading meeting details...</p></div>';
  container.classList.add('active');
  
  // Hide filter controls until loaded
  document.querySelector('.filter-controls').style.display = 'none';

  if (!meetings || meetings.length === 0) {
    container.innerHTML = '<div class="hearing-result"><p>No meetings found. This could be because:<br>• No meetings are scheduled<br>• The Congress.gov API has a delay<br>• Try selecting a different date</p></div>';
    loadedMeetings = [];
    return;
  }

  const targetDate = document.getElementById('meetingDate').value;
  const allFetched = [];

  // Returns whichever fetched meetings match the target date
  const getMatches = () => {
    if (!targetDate) return [...allFetched];
    return allFetched.filter(m => {
      const d = m.meetingDate || m.date || m.updateDate;
      if (!d) return false;
      const dp = (d.match(/^(\d{4}-\d{2}-\d{2})/) || ['', d.split('T')[0]])[1];
      return dp === targetDate;
    });
  };

  // Debounced progressive render — shows results as soon as any matching
  // meeting arrives rather than waiting for all 250 to complete.
  let renderPending = false;
  const scheduleRender = () => {
    if (renderPending) return;
    renderPending = true;
    setTimeout(() => {
      renderPending = false;
      const matches = getMatches();
      if (matches.length > 0) {
        populateCommitteeFilter(matches);
        document.querySelector('.filter-controls').style.display = 'block';
        renderMeetings(matches);
      }
    }, 0);
  };

  // Fetch all 250 detail records in parallel; render progressively as each arrives
  const fetchPromises = meetings.map(async (m) => {
    const eventId = m.eventId || m.eventid || (m.meeting && m.meeting.eventId);
    if (!eventId) return null;

    try {
      const detailUrl = `https://api.congress.gov/v3/committee-meeting/${congress}/${chamber}/${eventId}?api_key=${apiKey}&format=json`;
      const response = await fetch(detailUrl);
      if (!response.ok) return null;
      const data = await response.json();
      const result = data.meeting || data.committeeMeeting || data;
      allFetched.push(result);
      scheduleRender();
      return result;
    } catch (err) {
      console.error('Failed to fetch meeting details for eventId:', eventId, 'error:', err);
      return null;
    }
  });

  await Promise.all(fetchPromises);

  // Final authoritative render once everything is in
  loadedMeetings = getMatches();

  if (loadedMeetings.length === 0 && targetDate) {
    container.innerHTML = `<div class="hearing-result"><p>No meetings found for ${targetDate}.<br>Try selecting a different date or <a href="https://www.congress.gov/committee-schedule/" target="_blank">check Congress.gov directly</a>. Or, you can manually add meeting details below!</p></div>`;
    return;
  }

  populateCommitteeFilter(loadedMeetings);
  if (loadedMeetings.length > 0) {
    document.querySelector('.filter-controls').style.display = 'block';
  }
  renderMeetings(loadedMeetings);
  saveState();
}

// Extract unique committees and populate filter dropdown
function populateCommitteeFilter(meetings) {
  const filterSelect = document.getElementById('committeeFilter');
  
  // Get unique committee names
  const committees = new Set();
  meetings.forEach(m => {
    if (m.committee && m.committee.name) {
      committees.add(m.committee.name);
    } else if (m.committees && m.committees.length > 0) {
      committees.add(m.committees[0].name);
    }
  });
  
  // Clear and populate dropdown
  filterSelect.innerHTML = '<option value="">All Committees</option>';
  Array.from(committees).sort().forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    filterSelect.appendChild(option);
  });
}

// Filter meetings by selected committee and render
function filterAndRenderMeetings() {
  const selectedCommittee = document.getElementById('committeeFilter').value;
  
  if (!selectedCommittee) {
    renderMeetings(loadedMeetings);
    return;
  }
  
  const filtered = loadedMeetings.filter(m => {
    if (m.committee && m.committee.name) {
      return m.committee.name === selectedCommittee;
    } else if (m.committees && m.committees.length > 0) {
      return m.committees[0].name === selectedCommittee;
    }
    return false;
  });
  
  renderMeetings(filtered);
}

// Render meetings to the container
function renderMeetings(meetings) {
  const container = document.getElementById('searchResults');
  container.innerHTML = '';
  container.classList.add('active');
  
  if (meetings.length === 0) {
    container.innerHTML = '<div class="hearing-result"><p>No meetings match the selected filter.</p></div>';
    return;
  }
  
  const chamber = document.getElementById('chamber')?.value || 'house';
  
  meetings.forEach(meeting => {
    const div = document.createElement('div');
    div.className = 'hearing-result';
    
    const title = meeting.title || 'Untitled Meeting';
    
    // committee might be single object or in committees array
    let committee = 'Unknown Committee';
    if (meeting.committee && meeting.committee.name) {
      committee = meeting.committee.name;
    } else if (meeting.committees && meeting.committees.length > 0) {
      committee = meeting.committees[0].name || 'Unknown Committee';
    }
    
    // meetingDate or date
    let date = meeting.meetingDate || meeting.date || meeting.updateDate || 'Date TBD';
    
    const meetingType = meeting.type || 'hearing';
    
    // Format date as dd MMM yyyy (e.g., 26 Apr 2026)
    let formattedDate = 'Date TBD';
    if (date) {
      try {
        const d = new Date(date);
        if (!isNaN(d)) {
          formattedDate = d.toLocaleDateString('en-US', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          });
        }
      } catch {}
    }
    
    div.innerHTML = `
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(committee)} • ${meetingType.charAt(0).toUpperCase() + meetingType.slice(1)} • ${formattedDate}</p>
    `;
    
    div.addEventListener('click', () => populateFromMeeting(meeting));
    container.appendChild(div);
  });
}

// Populate form from committee meeting data
async function populateFromMeeting(m) {
  console.log('Full API Result for Selected Meeting/Markup:', m);
  
  // committee might be object or in committees array
  let committee = '';
  if (m.committee && m.committee.name) {
    committee = m.committee.name;
  } else if (m.committees && m.committees.length > 0) {
    committee = m.committees[0].name || '';
  }
  
  // Remove 'House ' or 'Senate ' prefix from committee name for binder
  committee = committee.replace(/^(House |Senate )/i, '');
  
  const title = m.title || '';
  const date = m.meetingDate || m.date || m.updateDate || '';
  
  // Extract time from ISO date string if available
  let timeStr = '';
  if (date && date.includes('T')) {
    try {
      const d = new Date(date);
      if (!isNaN(d)) {
        timeStr = d.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
      }
    } catch {}
  }
  
  // location is an object with building and room
  let location = 'Capitol Hill';
  if (m.location) {
    const parts = [];
    if (m.location.building) parts.push(m.location.building);
    if (m.location.room) parts.push(`Room ${m.location.room}`);
    if (parts.length > 0) location = parts.join(', ');
  }
  
  // Extract meeting type from API data (e.g., "Markup" or "Hearing")
  const apiMeetingType = m.type || 'hearing';
  const normalizedType = apiMeetingType.toLowerCase().includes('markup') ? 'markup' : 'hearing';
  document.getElementById('meetingType').value = normalizedType;
  updateTitleLabel();
  
  document.getElementById('committee').value = committee;
  document.getElementById('hearingTitle').value = title;
  document.getElementById('hearingDate').value = formatDate(date);
  document.getElementById('hearingTime').value = timeStr;
  document.getElementById('location').value = location;
  
  // Determine meeting type and set appropriate second item
  const meetingType = normalizedType;
  const secondItemText = meetingType === 'markup' ? 'Strike the Last Word' : 'Talking Points and Questions';
  
  // New TOC format: Committee Memorandum first, then appropriate second item, then witnesses without "The Honorable"
  const tocData = [
    { text: 'Committee Memorandum', page: 1 },
    { text: secondItemText, page: 2 }
  ];
  
  // Add witness testimony for hearings (strip "The Honorable" prefix)
  const witnesses = m.witnesses || [];
  if (witnesses.length > 0 && meetingType === 'hearing') {
    witnesses.forEach((w, i) => {
      let name = w.name || `Witness ${i + 1}`;
      // Remove "The Honorable" prefix and variants - more robust pattern
      name = name.trim()
        .replace(/^the\s+hon\.?(orable)?\s+/i, '')
        .replace(/^hon\.?(orable)?\s+/i, '')
        .replace(/^mr\.?\s+/i, '')
        .replace(/^ms\.?\s+/i, '')
        .replace(/^mrs\.?\s+/i, '')
        .replace(/^dr\.?\s+/i, '');
      tocData.push({ text: `${name} Testimony`, page: 3 + i });
    });
  }
  
  // Add bills for markups - bills are under relatedItems.bills
  const bills = m.relatedItems?.bills || [];
  
  if (bills.length > 0 && meetingType === 'markup') {
        // Fetch bill details in parallel
    const billPromises = bills.map(async (b, i) => {
      const billType = b.type || 'hr';
      const billNumber = b.number || b.billNumber;
      const congress = b.congress || m.congress || currentCongress || '119';
      
      // Use just bill number for tabs to ensure they fit
      const formattedBillNum = `${billType.toUpperCase()} ${billNumber}`;
            
      try {
        const billUrl = `https://api.congress.gov/v3/bill/${congress}/${billType}/${billNumber}?api_key=${apiKey}&format=json`;
        const response = await fetch(billUrl);
        if (!response.ok) return { toc: formattedBillNum, tab: formattedBillNum, index: i };
        const data = await response.json();
        const bill = data.bill || data;
        
        // Format: "HR 1234: Title (Sponsor)" for TOC
        const title = bill.title || bill.shortTitle || '';
        const sponsorObj = bill.sponsors && bill.sponsors.length > 0 ? bill.sponsors[0] : null;
        const sponsorLastName = sponsorObj ? (sponsorObj.lastName || '') : '';
        
        let tocText = formattedBillNum;
        if (title) {
          tocText += `: ${title}`;
          if (sponsorLastName) {
            tocText += ` (Rep. ${sponsorLastName})`;
          }
        }
        
                return {
          toc: tocText,
          tab: formattedBillNum,
          index: i
        };
      } catch (err) {
        console.error('Failed to fetch bill details:', err);
        // Fallback to just bill number
        return {
          toc: formattedBillNum,
          tab: formattedBillNum,
          index: i
        };
      }
    });
    
    const billDetails = await Promise.all(billPromises);
        
    // Add to TOC and tabs
    billDetails.forEach(bd => {
      if (bd) {
                tocData.push({ text: bd.toc, page: 3 + bd.index, tab: bd.tab });
      }
    });
  }

  // Extract PDF links from meeting data first
  meetingMaterials = extractMeetingMaterials(m);

  // Extract bill numbers from title and add to TOC if not already present
  const congress = m.congress || currentCongress || '119';
  const titleBills = extractBillNumbersFromTitle(title);

  if (titleBills.length > 0) {
    for (const bill of titleBills) {
      // Check if bill already exists in TOC
      if (!billExistsInTOC(bill.type, bill.number)) {
        // Fetch bill details and add to TOC
        const billResult = await fetchBillDetails(bill.type, bill.number, congress);
        const formattedBillNum = `${bill.type.toUpperCase()} ${bill.number}`;
        tocData.push({ text: billResult.tocText, page: tocData.length + 1, tab: formattedBillNum });

        // Add PDF to meeting materials if available
        if (billResult.pdfUrl) {
          meetingMaterials.push({
            label: `${formattedBillNum} Text`,
            url: billResult.pdfUrl
          });
        }
      }
    }
  }

  // Set the TOC data and render
  tocItems = tocData;
    renderTocList();
    updateTabsPreview();

  // Enhance existing bill entries with full details if they lack them
  await enhanceBillEntries(congress);
  renderTocList();
  updateTabsPreview();

  // Scroll to form
  document.querySelector('.binder-form').scrollIntoView({ behavior: 'smooth' });
  showMessage('Meeting details loaded! TOC items are editable - drag to reorder.', 'success');

  // Render materials buttons
  renderMaterialsButtons();

  // Save state after populating meeting
  saveState();
}

// Extract bill numbers from title using regex patterns
function extractBillNumbersFromTitle(title) {
  if (!title) return [];
  const bills = [];
  const patterns = [
    // H.R. 1234 or HR 1234
    { regex: /\bH\.?R\.?\s*(\d+)/gi, type: 'hr' },
    // S. 1234 or S 1234
    { regex: /\bS\.?\s*(\d+)/gi, type: 's' },
    // H.J.Res. 123 or HJRes 123
    { regex: /\bH\.?J\.?\.?Res\.?\s*(\d+)/gi, type: 'hjres' },
    // S.J.Res. 123 or SJRes 123
    { regex: /\bS\.?J\.?\.?Res\.?\s*(\d+)/gi, type: 'sjres' },
    // H.Con.Res. 123 or HConRes 123
    { regex: /\bH\.?Con\.?\.?Res\.?\s*(\d+)/gi, type: 'hconres' },
    // S.Con.Res. 123 or SConRes 123
    { regex: /\bS\.?Con\.?\.?Res\.?\s*(\d+)/gi, type: 'sconres' },
    // H.Res. 123 or HRes 123
    { regex: /\bH\.?Res\.?\s*(\d+)/gi, type: 'hres' },
    // S.Res. 123 or SRes 123
    { regex: /\bS\.?Res\.?\s*(\d+)/gi, type: 'sres' }
  ];

  patterns.forEach(pattern => {
    const matches = title.matchAll(pattern.regex);
    for (const match of matches) {
      bills.push({ type: pattern.type, number: match[1] });
    }
  });

  return bills;
}

// Fetch bill details from API and return formatted TOC text and PDF URL
async function fetchBillDetails(billType, billNumber, congress) {
  const formattedBillNum = `${billType.toUpperCase()} ${billNumber}`;
  try {
    const url = `https://api.congress.gov/v3/bill/${congress}/${billType}/${billNumber}?api_key=${apiKey}&format=json`;
    const response = await fetch(url);
    if (!response.ok) {
      return { tocText: formattedBillNum, pdfUrl: null };
    }
    const data = await response.json();
    const bill = data.bill || data;

    const title = bill.title || bill.shortTitle || '';
    const sponsorObj = bill.sponsors && bill.sponsors.length > 0 ? bill.sponsors[0] : null;
    const sponsorLastName = sponsorObj ? (sponsorObj.lastName || '') : '';

    let pdfUrl = null;

    // Check if textVersions endpoint exists and fetch it
    if (bill.textVersions && bill.textVersions.url) {
      try {
        const textResponse = await fetch(`${bill.textVersions.url}&api_key=${apiKey}&format=json`);
        if (textResponse.ok) {
          const textData = await textResponse.json();
          const textVersions = textData.textVersions || textData;
          if (textVersions && textVersions.length > 0) {
            // Get the most recent text version (usually the last one or has type "Introduced")
            const latestVersion = textVersions[textVersions.length - 1];
            pdfUrl = latestVersion.pdfUrl || latestVersion.url || latestVersion.formats?.[0]?.url || null;
          }
        }
      } catch (err) {
        console.error('Failed to fetch text versions:', err);
      }
    }

    let tocText = formattedBillNum;
    if (title) {
      tocText += `: ${title}`;
      if (sponsorLastName) {
        tocText += ` (Rep. ${sponsorLastName})`;
      }
    }
    return { tocText, pdfUrl };
  } catch (err) {
    console.error('Failed to fetch bill details:', err);
    return { tocText: formattedBillNum, pdfUrl: null };
  }
}

// Check if a bill already exists in TOC by type and number
function billExistsInTOC(billType, billNumber) {
  const normalizedBillNum = `${billType.toUpperCase()} ${billNumber}`;
  return tocItems.some(item => {
    const text = item.text || '';
    // Check if the text starts with the bill number
    return text.startsWith(normalizedBillNum);
  });
}

// Enhance existing bill entries in TOC with full details
async function enhanceBillEntries(congress) {
  for (let i = 0; i < tocItems.length; i++) {
    const item = tocItems[i];
    const text = item.text || '';

    // Check if this is a bill entry without full details (no colon/title)
    const billMatch = text.match(/^(H\.?R\.?\s*\d+|S\.?\s*\d+|H\.?J\.?\.?Res\.?\s*\d+|S\.?J\.?\.?Res\.?\s*\d+|H\.?Con\.?\.?Res\.?\s*\d+|S\.?Con\.?\.?Res\.?\s*\d+|H\.?Res\.?\s*\d+|S\.?Res\.?\s*\d+)/i);

    if (billMatch && !text.includes(':')) {
      // This is a bill entry without full details
      const billStr = billMatch[1];
      const bills = extractBillNumbersFromTitle(billStr);

      if (bills.length > 0) {
        const bill = bills[0];
        const billResult = await fetchBillDetails(bill.type, bill.number, congress);
        tocItems[i].text = billResult.tocText;
        tocItems[i].tab = `${bill.type.toUpperCase()} ${bill.number}`;

        // Add PDF to meeting materials if available
        if (billResult.pdfUrl) {
          const formattedBillNum = `${bill.type.toUpperCase()} ${bill.number}`;
          // Check if this PDF is already in meeting materials
          const alreadyExists = meetingMaterials.some(m => m.url === billResult.pdfUrl);
          if (!alreadyExists) {
            meetingMaterials.push({
              label: `${formattedBillNum} Text`,
              url: billResult.pdfUrl
            });
          }
        }
      }
    }
  }
}

// Extract PDF links from meeting data
function extractMeetingMaterials(meeting) {
  const materials = [];

  // Check for meeting notice PDF
  if (meeting.pdf) {
    materials.push({
      label: 'Meeting Notice',
      url: meeting.pdf
    });
  }

  // Check for related bills with PDFs
  if (meeting.relatedItems?.bills) {
    meeting.relatedItems.bills.forEach(bill => {
      if (bill.pdf) {
        materials.push({
          label: `${bill.type?.toUpperCase() || 'Bill'} ${bill.number || bill.billNumber} Text`,
          url: bill.pdf
        });
      }
    });
  }

  // Check for witness testimony PDFs
  if (meeting.witnesses) {
    meeting.witnesses.forEach((witness, i) => {
      if (witness.pdf) {
        const name = witness.name || `Witness ${i + 1}`;
        materials.push({
          label: `${name} Testimony`,
          url: witness.pdf
        });
      }
    });
  }

  // Check for witness documents (biographies, statements, etc.)
  if (meeting.witnessDocuments && Array.isArray(meeting.witnessDocuments)) {
    meeting.witnessDocuments.forEach((doc, i) => {
      if (doc.url && doc.url.endsWith('.pdf')) {
        const label = doc.documentType === 'Witness Biography' ? 'Witness Biography' :
                     doc.documentType === 'Witness Statement' ? 'Witness Statement' :
                     doc.documentType || `Document ${i + 1}`;
        materials.push({
          label: label,
          url: doc.url
        });
      }
    });
  }

  // Check for other PDF links in the meeting object
  if (meeting.urls) {
    meeting.urls.forEach((urlObj, i) => {
      if (urlObj.url && urlObj.url.endsWith('.pdf')) {
        materials.push({
          label: urlObj.name || `Document ${i + 1}`,
          url: urlObj.url
        });
      }
    });
  }

  // Check for meeting documents (Congress.gov uses this field)
  if (meeting.meetingDocuments && Array.isArray(meeting.meetingDocuments)) {
    meeting.meetingDocuments.forEach((doc, i) => {
      if (doc.url && doc.url.endsWith('.pdf')) {
        materials.push({
          label: doc.name || doc.type || `Document ${i + 1}`,
          url: doc.url
        });
      }
    });
  }

  // Check for content links (Congress.gov often uses this field)
  if (meeting.content && Array.isArray(meeting.content)) {
    meeting.content.forEach((item, i) => {
      if (item.url && item.url.endsWith('.pdf')) {
        materials.push({
          label: item.name || item.type || `Document ${i + 1}`,
          url: item.url
        });
      }
    });
  }

  return materials;
}

// Render materials buttons
function renderMaterialsButtons() {
  const section = document.getElementById('materialsSection');
  const container = document.getElementById('materialsButtons');

  if (!meetingMaterials || meetingMaterials.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  container.innerHTML = '';

  meetingMaterials.forEach(material => {
    const button = document.createElement('button');
    button.className = 'secondary';
    // Truncate long labels with ellipsis (max 30 chars for materials)
    let label = material.label;
    if (label.length > 30) {
      label = label.substring(0, 30) + '...';
    }
    button.textContent = label;

    // Extract filename from URL
    const urlParts = material.url.split('/');
    const fileName = urlParts[urlParts.length - 1];
    // Show full label and filename in tooltip on two lines
    button.title = `${material.label}\n${fileName}`;

    button.addEventListener('click', () => {
      window.open(material.url, '_blank');
    });
    container.appendChild(button);
  });
}

// TOC Data Store - array of { text, page, isSub?: boolean }
let tocItems = [];
let customTabText = {}; // Store custom tab text indexed by TOC index
let dragSrcEl = null;

// Render TOC list
function renderTocList() {
  const container = document.getElementById('tocList');
  container.innerHTML = '';
  
  if (tocItems.length === 0) {
    container.innerHTML = '<div style="padding: 20px; color: var(--text-muted); text-align: center;">No items. Click "+ Add Item" or load a meeting.</div>';
    return;
  }
  
  tocItems.forEach((item, index) => {
        const div = document.createElement('div');
    div.className = `toc-item ${item.isSub ? 'toc-item-sub' : ''}`;
    div.draggable = true;
    div.dataset.index = index;
    
    div.innerHTML = `
      <span class="drag-handle">☰</span>
      <span class="toc-item-text">${escapeHtml(item.text)}</span>
      <button class="toc-item-edit" title="Edit">✎</button>
      <button class="toc-item-delete" title="Delete">×</button>
    `;
    
    // Drag events
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragover', handleDragOver);
    div.addEventListener('dragleave', handleDragLeave);
    div.addEventListener('drop', handleDrop);
    div.addEventListener('dragend', handleDragEnd);
    
    // Edit button
    div.querySelector('.toc-item-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      enableEditMode(div, index);
    });
    
    // Delete button
    div.querySelector('.toc-item-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      tocItems.splice(index, 1);
      renderTocList();
      updateTabsPreview();
    });
    
    container.appendChild(div);
  });
}

// Enable inline editing
function enableEditMode(div, index) {
  const textSpan = div.querySelector('.toc-item-text');
  const editBtn = div.querySelector('.toc-item-edit');
  const currentText = tocItems[index].text;
  
  // Change pencil to checkmark
  editBtn.textContent = '✓';
  editBtn.title = 'Save';
  editBtn.classList.add('saving');
  
  textSpan.innerHTML = `<input type="text" value="${escapeHtml(currentText)}" />`;
  const input = textSpan.querySelector('input');
  input.focus();
  input.select();
  
  const saveEdit = () => {
    tocItems[index].text = input.value.trim() || currentText;
    renderTocList();
    updateTabsPreview();
  };
  
  const cancelEdit = () => {
    renderTocList();
  };
  
  // Save on blur or Enter
  input.addEventListener('blur', saveEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  });
  
  // Save on checkmark click
  editBtn.onclick = (e) => {
    e.stopPropagation();
    saveEdit();
  };
}

// Drag and drop handlers
function handleDragStart(e) {
  dragSrcEl = this;
  e.dataTransfer.effectAllowed = 'move';
  this.classList.add('dragging');
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  
  // Show drop indicator based on mouse position
  if (this !== dragSrcEl) {
    const rect = this.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    
    // Clear all indicators
    document.querySelectorAll('.toc-item').forEach(item => {
      item.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    
    // Add indicator based on whether mouse is in top or bottom half
    if (e.clientY < midpoint) {
      this.classList.add('drag-over-top');
      this.classList.remove('drag-over-bottom');
    } else {
      this.classList.add('drag-over-bottom');
      this.classList.remove('drag-over-top');
    }
  }
  
  return false;
}

function handleDragLeave(e) {
  // Remove indicators when leaving an item
  this.classList.remove('drag-over-top', 'drag-over-bottom');
}

function handleDrop(e) {
  e.stopPropagation();
  
  // Clear indicators
  document.querySelectorAll('.toc-item').forEach(item => {
    item.classList.remove('drag-over-top', 'drag-over-bottom');
  });
  
  if (dragSrcEl !== this) {
    const srcIndex = parseInt(dragSrcEl.dataset.index);
    const targetIndex = parseInt(this.dataset.index);
    
    // Determine if dropping above or below based on indicator class
    const isBelow = this.classList.contains('drag-over-bottom');
    
    // Remove from source
    const [moved] = tocItems.splice(srcIndex, 1);
    
    // Calculate new index
    let newIndex = targetIndex;
    if (srcIndex < targetIndex && !isBelow) {
      newIndex = targetIndex - 1;
    } else if (srcIndex > targetIndex && isBelow) {
      newIndex = targetIndex + 1;
    }
    
    // Insert at new position
    tocItems.splice(newIndex, 0, moved);
    
    renderTocList();
    updateTabsPreview();
  }
  
  return false;
}

function handleDragEnd() {
  this.classList.remove('dragging');
  // Clear all indicators
  document.querySelectorAll('.toc-item').forEach(item => {
    item.classList.remove('drag-over-top', 'drag-over-bottom');
  });
  dragSrcEl = null;
}

// Add new TOC item
document.getElementById('addTocItem').addEventListener('click', () => {
  tocItems.push({ text: 'New Item', page: tocItems.length + 1 });
  renderTocList();
  updateTabsPreview();
  
  // Auto-edit the new item
  setTimeout(() => {
    const items = document.querySelectorAll('.toc-item');
    if (items.length > 0) {
      const lastItem = items[items.length - 1];
      enableEditMode(lastItem, tocItems.length - 1);
    }
  }, 50);
});

// Fetch detailed hearing info when clicked
async function fetchHearingDetails(url) {
  try {
    const response = await fetch(`${url}?api_key=${apiKey}&format=json`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.hearing || data;
  } catch {
    return null;
  }
}

// Update tabs preview based on TOC
function updateTabsPreview() {
  // Get all first-level items for tabs (unlimited)
  const tabs = tocItems
    .filter((item, index) => !item.isSub)
    .map((item, index) => {
      // Use custom tab text if available, otherwise use tab field or text
      let tabText = customTabText[index] || item.tab || item.text;
      // Abbreviate "Strike the Last Word" to "STLW" for tabs, preserving suffixes/prefixes
      if (tabText.toLowerCase().includes('strike the last word')) {
        tabText = tabText.replace(/strike the last word/gi, 'STLW');
      }
      return tabText;
    });

  const previewContainer = document.getElementById('tabsPreview');

  if (!previewContainer) {
    console.error('tabsPreview element not found!');
    return;
  }

  previewContainer.innerHTML = '';

  if (tabs.length === 0) {
    previewContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 12px;">Add items to generate tabs</span>';
  } else {
    tabs.forEach((tab, i) => {
      const badge = document.createElement('span');
      badge.className = 'tab-badge';
      badge.textContent = tab;
      badge.dataset.index = i;
      badge.contentEditable = true;
      badge.spellcheck = false; // Disable spellcheck by default
      badge.addEventListener('focus', () => {
        badge.spellcheck = true; // Enable spellcheck when editing
      });
      badge.addEventListener('blur', () => {
        badge.spellcheck = false; // Disable spellcheck when done editing
        saveTabEdit(i, badge.textContent);
      });
      badge.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          badge.blur();
        }
      });
      previewContainer.appendChild(badge);
    });
  }
}

// Save custom tab text
function saveTabEdit(index, newText) {
  const originalIndex = tocItems.findIndex((item, i) => !item.isSub && i === index);
  if (originalIndex !== -1) {
    customTabText[originalIndex] = newText.trim();
    saveState();
  }
}

// Initialize empty TOC
renderTocList();

// Clear TOC
document.getElementById('clearToc').addEventListener('click', () => {
  tocItems = [];
  customTabText = {};
  renderTocList();
  updateTabsPreview();
});

// Clear all data
document.getElementById('clearAll').addEventListener('click', () => {
  clearAllData();
});

// Toggle bill search section
document.getElementById('searchBill').addEventListener('click', () => {
  const billSearch = document.getElementById('billSearch');
  billSearch.style.display = billSearch.style.display === 'none' ? 'block' : 'none';
  if (billSearch.style.display === 'block') {
    document.getElementById('billNumber').focus();
  }
});

// Search for bills
document.getElementById('executeBillSearch').addEventListener('click', async () => {
  const billType = document.getElementById('billType').value;
  const billNumber = document.getElementById('billNumber').value.trim();

  if (!billNumber) {
    showMessage('Please enter a bill number', 'error');
    return;
  }

  if (!apiKey || !useApi) {
    showMessage('API key required to search bills', 'error');
    return;
  }

  const resultsContainer = document.getElementById('billSearchResults');
  resultsContainer.innerHTML = '<p><span class="loading"></span> Searching...</p>';

  try {
    // Use the specific bill endpoint: /bill/{congress}/{billType}/{billNumber}
    const congress = currentCongress || '119'; // Use fetched congress or fallback to 119
    const url = `https://api.congress.gov/v3/bill/${congress}/${billType}/${billNumber}?api_key=${apiKey}&format=json`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const bill = data.bill || data;

    if (!bill || !bill.number) {
      resultsContainer.innerHTML = '<p>No bill found. Check the bill type and number.</p>';
      return;
    }

    const title = bill.title || bill.shortTitle || '';
    const sponsorObj = bill.sponsors && bill.sponsors.length > 0 ? bill.sponsors[0] : null;
    const sponsorLastName = sponsorObj ? (sponsorObj.lastName || '') : '';
    const sponsorFullName = sponsorObj ? (sponsorObj.fullName || '') : '';
    const formattedBillNum = `${billType.toUpperCase()} ${billNumber}`;

    resultsContainer.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'bill-result';
    div.innerHTML = `
      <h5>${escapeHtml(formattedBillNum)}${title ? `: ${escapeHtml(title)}` : ''}</h5>
      <p>${sponsorFullName ? escapeHtml(sponsorFullName) : 'No sponsor'}</p>
    `;

    div.addEventListener('click', () => {
      let tocText = formattedBillNum;
      if (title) {
        tocText += `: ${title}`;
        if (sponsorLastName) {
          tocText += ` (Rep. ${sponsorLastName})`;
        }
      }

      tocItems.push({ text: tocText, page: tocItems.length + 1, tab: formattedBillNum });
      renderTocList();
      updateTabsPreview();
      showMessage('Bill added to TOC', 'success');
    });

    resultsContainer.appendChild(div);
  } catch (err) {
    showMessage(`Failed to search bills: ${err.message}`, 'error');
    resultsContainer.innerHTML = '<p>Search failed. Please try again.</p>';
  }
});

// Binder count slider
document.getElementById('binderCount').addEventListener('input', (e) => {
  document.getElementById('binderCountValue').textContent = e.target.value;
  localStorage.setItem('binderCount', e.target.value);
});

// Tab template radio buttons
document.querySelectorAll('input[name="tabTemplate"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    localStorage.setItem('tabTemplate', e.target.value);
  });
});

// Paper size select
document.getElementById('paperSize').addEventListener('change', (e) => {
  localStorage.setItem('paperSize', e.target.value);
});

// Committee filter select
document.getElementById('committeeFilter').addEventListener('change', () => {
  filterAndRenderMeetings();
});

// Initialize display on page load
document.getElementById('binderCountValue').textContent = document.getElementById('binderCount').value;

// Restore preferences from localStorage
if (localStorage.getItem('binderCount')) {
  document.getElementById('binderCount').value = localStorage.getItem('binderCount');
  document.getElementById('binderCountValue').textContent = localStorage.getItem('binderCount');
}

if (localStorage.getItem('tabTemplate')) {
  const savedTemplate = localStorage.getItem('tabTemplate');
  const templateRadio = document.querySelector(`input[name="tabTemplate"][value="${savedTemplate}"]`);
  if (templateRadio) {
    templateRadio.checked = true;
  }
}

if (localStorage.getItem('paperSize')) {
  document.getElementById('paperSize').value = localStorage.getItem('paperSize');
}

function formatDateForDisplay(dateStr) {
  if (!dateStr) return 'Date TBD';
  try {
    if (dateStr.includes('T')) {
      const d = new Date(dateStr);
      if (!isNaN(d)) return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [year, month, day] = dateStr.split('-');
      const d = new Date(year, month - 1, day);
      if (!isNaN(d)) return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } else {
      const d = new Date(dateStr);
      if (!isNaN(d)) return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      return dateStr;
    }
  } catch {}
  return 'Date TBD';
}

// PDF Generation Functions
function getFormData() {
  const toc = parseToc();
  // Auto-generate tabs from TOC first-level items (unlimited, PDF handles pagination)
  // Use custom tab text if available, otherwise use tab field or text
  const tabs = toc
    .map((item, index) => {
      let tabText = customTabText[index] || (item.tab || item.text).trim();
      // Abbreviate "Strike the Last Word" to "STLW" for tabs, preserving suffixes/prefixes
      if (tabText.toLowerCase().includes('strike the last word')) {
        tabText = tabText.replace(/strike the last word/gi, 'STLW');
      }
      return tabText;
    });

  return {
    committee: document.getElementById('committee').value,
    title: document.getElementById('hearingTitle').value,
    date: document.getElementById('hearingDate').value,
    time: document.getElementById('hearingTime').value,
    location: document.getElementById('location').value,
    meetingType: document.getElementById('meetingType').value,
    toc: toc,
    tabs: tabs.length > 0 ? tabs : ['Documents'],
    paperSize: document.getElementById('paperSize').value,
    binderCount: parseInt(document.getElementById('binderCount').value) || 1
  };
}

function parseToc() {
  // Return current tocItems array
  return tocItems.map((item, index) => ({
    text: item.text,
    tab: item.tab,
    page: item.page || (index + 1)
  }));
}

// Generate Cover Sheet PDF - House Committee style
async function generateCoverPDF(data) {
  // Load Public Sans font
  await loadPublicSansFont();

  const format = data.paperSize === 'a4' ? 'a4' : 'letter';
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: format
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const centerX = pageW / 2;

  // Committee name at top - underlined, centered, with line wrapping
  doc.setFontSize(24);
  doc.setTextColor(0, 0, 0);
  setPublicSans(doc, 'bold');
  const committeeText = data.committee || 'Committee Name';
  const committeeMargin = 80; // 80pt margin on each side
  const maxCommitteeWidth = pageW - (committeeMargin * 2);
  const committeeLines = doc.splitTextToSize(committeeText, maxCommitteeWidth);
  const committeeY = 100;
  
  // Draw each line of committee name with underline
  committeeLines.forEach((line, i) => {
    const lineWidth = doc.getTextWidth(line);
    const lineY = committeeY + (i * 28);
    doc.text(line, centerX - lineWidth / 2, lineY);
    
    // Draw underline for this line
    doc.setLineWidth(1.5);
    doc.line(centerX - lineWidth / 2, lineY + 6, centerX + lineWidth / 2, lineY + 6);
  });
  
  // Hearing title in italics below - with margins and line wrapping
  doc.setFontSize(18);
  setPublicSans(doc, 'normal', 'italic');
  const titleMargin = 80; // 80pt margin on each side
  const maxTitleWidth = pageW - (titleMargin * 2);
  const titleLines = doc.splitTextToSize(data.title || 'Markup of', maxTitleWidth);
  
  let titleY = committeeY + (committeeLines.length * 28) + 20;
  titleLines.forEach((line, i) => {
    const lineWidth = doc.getTextWidth(line);
    doc.text(line, centerX - lineWidth / 2, titleY + (i * 24));
  });
  
  // Calculate available space between title and bottom text
  const titleEndY = committeeY + (committeeLines.length * 28) + (titleLines.length * 24) + 20;
  const bottomStartY = pageH - 150; // Space for date/time/location
  const availableSpace = bottomStartY - titleEndY;
  
  // House Seal - centered in available space
  const sealSize = 250;
  const sealY = titleEndY + (availableSpace - sealSize) / 2;

  // Load and embed the House seal SVG
  try {
    const sealSvgUrl = 'House Seal.svg';
    const response = await fetch(sealSvgUrl);

    if (response.ok) {
      const svgText = await response.text();

      // Create a temporary container to hold the SVG
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = svgText;
      const svgElement = tempDiv.querySelector('svg');

      if (!svgElement) {
        throw new Error('Could not find SVG element in fetched content');
      }

      // Get original viewBox or use default
      let viewBox = svgElement.getAttribute('viewBox') || '0 0 200 200';
      const vbParts = viewBox.split(' ').map(Number);
      const vbWidth = vbParts[2] || 200;
      const vbHeight = vbParts[3] || 200;

      // Calculate the seal's position in page coordinates
      const sealX = centerX - sealSize / 2;

      // Create a full-page wrapper SVG with the seal at the correct position
      const wrapperSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      wrapperSvg.setAttribute('width', String(pageW));
      wrapperSvg.setAttribute('height', String(pageH));
      wrapperSvg.setAttribute('viewBox', `0 0 ${pageW} ${pageH}`);

      // Create a group for the seal content
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      // Position the seal at the correct location on the page
      // Scale to fit and center within the seal area
      const scale = sealSize / Math.max(vbWidth, vbHeight);
      const contentOffsetX = (sealSize - vbWidth * scale) / 2;
      const contentOffsetY = (sealSize - vbHeight * scale) / 2;
      group.setAttribute('transform', `translate(${sealX + contentOffsetX}, ${sealY + contentOffsetY}) scale(${scale})`);

      // Clone the original SVG content into the group
      const content = svgElement.cloneNode(true);
      content.removeAttribute('width');
      content.removeAttribute('height');
      content.removeAttribute('x');
      content.removeAttribute('y');
      content.setAttribute('viewBox', viewBox);

      // Move all children from the cloned SVG to the group
      while (content.firstChild) {
        group.appendChild(content.firstChild);
      }

      wrapperSvg.appendChild(group);
      tempDiv.appendChild(wrapperSvg);

      // Append to DOM temporarily so svg2pdf can calculate positions correctly
      tempDiv.style.position = 'absolute';
      tempDiv.style.visibility = 'hidden';
      tempDiv.style.left = '0';
      tempDiv.style.top = '0';
      document.body.appendChild(tempDiv);

      try {
        // Use svg2pdf.js to render the full-page wrapper SVG at origin
        await svg2pdf(wrapperSvg, doc, {
          x: 0,
          y: 0,
          width: pageW,
          height: pageH
        });
      } finally {
        // Clean up
        document.body.removeChild(tempDiv);
      }
    } else {
      throw new Error(`Failed to load seal SVG: ${response.status}`);
    }
  } catch (e) {
    console.log('Could not load seal SVG:', e);
    // Fallback: simple placeholder with proper centering
    const sealCenterY = sealY + sealSize / 2;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(2);
    doc.circle(centerX, sealCenterY, sealSize / 2, 'S');
    doc.setLineWidth(1);
    doc.circle(centerX, sealCenterY, sealSize / 2 - 15, 'S');
    doc.setFontSize(11);
    setPublicSans(doc, 'bold');
    // Center text accounting for baseline offset
    const textY = sealCenterY + 3;
    doc.text('U.S. HOUSE OF', centerX, textY - 8, { align: 'center' });
    doc.text('REPRESENTATIVES', centerX, textY + 8, { align: 'center' });
  }
  
  // Date, time, location at bottom - centered
  const bottomY = pageH - 100;

  doc.setFontSize(18);
  setPublicSans(doc, 'bold');
  doc.setTextColor(0, 0, 0);

  const formattedDate = formatDateForDisplay(data.date);
  const timeText = data.time || '10:00 AM';

  doc.text(formattedDate, centerX, bottomY, { align: 'center' });
  doc.text(timeText, centerX, bottomY + 30, { align: 'center' });
  
  // Location
  doc.text(data.location || 'Location TBD', centerX, bottomY + 60, { align: 'center' });
  
  return doc;
}

// Generate Table of Contents PDF
async function generateTocPDF(data) {
  await loadPublicSansFont();

  const format = data.paperSize === 'a4' ? 'a4' : 'letter';
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: format
  });

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 60;
  let y = 80;

  // Committee name and type - centered with line wrapping
  doc.setFontSize(16);
  setPublicSans(doc, 'normal');
  const committeeText = data.committee || 'Committee Name';
  const meetingType = data.meetingType || 'hearing';
  const headerText = `${committeeText} ${meetingType.charAt(0).toUpperCase() + meetingType.slice(1)}`;
  const headerLines = doc.splitTextToSize(headerText, pageW - (margin * 2));
  headerLines.forEach((line, i) => {
    doc.text(line, pageW / 2, y + (i * 20), { align: 'center' });
  });
  y += (headerLines.length * 20) + 5; // Spacing after committee name

  // Date and time in italics - centered
  setPublicSans(doc, 'normal', 'italic');

  const formattedDate = formatDateForDisplay(data.date);
  const timeText = data.time || '10:00 AM';

  doc.text(formattedDate, pageW / 2, y, { align: 'center' });
  y += 25;
  doc.text(timeText, pageW / 2, y, { align: 'center' });
  y += 40;

  // Contents header underlined - left aligned
  setPublicSans(doc, 'normal');
  doc.text('Contents:', margin, y);
  doc.setLineWidth(1.5);
  doc.line(margin, y + 6, margin + doc.getTextWidth('Contents:'), y + 6);
  y += 30;

  // TOC entries - numbered with justified numbers and line wrapping
  doc.setFontSize(16);
  setPublicSans(doc, 'normal');

  data.toc.forEach((item, index) => {
    if (y > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      y = 60;
    }

    const text = item.text.startsWith('  ') ? '    ' + item.text.trim() : item.text;
    // Use regular numbers without leading zeros
    const numberedText = `${index + 1}. ${text}`;

    // Text wrapping for long entries using jsPDF's splitTextToSize
    const maxWidth = pageW - (margin * 2);
    const lines = doc.splitTextToSize(numberedText, maxWidth);

    // Draw each line
    lines.forEach((line, lineIndex) => {
      doc.text(line, margin, y);
      y += 22;
    });
    
    // Add extra space between items for better readability
    y += 8;
  });
  
  return doc;
}

// Generate Binder Tabs PDF
// Template: First cell 0.5" from top, 2.75" from left
// Cell size: 1.5" wide x 0.5" tall, 2 columns, 20 rows
// Supports multiple pages for >20 tabs
async function generateTabsPDF(data) {
  await loadPublicSansFont();

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: 'letter'
  });
  
  const selectedTemplate = document.querySelector('input[name="tabTemplate"]:checked');
  const useAvery8Tab = selectedTemplate?.value === 'avery8Tab';
  const showBorders = selectedTemplate?.value === 'cutLines';
  
  // Template dimensions based on selection
  let tabW, tabH, leftX, rightX, startY, rowGap, rows, endY;
  
  tabW = 1.5;
  tabH = 0.5;
  leftX = 2.75;
  rightX = 4.25;
  startY = 0.5;
  rowGap = 0.5;
  rows = 20;
  endY = startY + (rows * rowGap);

  doc.setTextColor(0, 0, 0);
  setPublicSans(doc, 'bold');

  // Get all tabs (no limit) - truncation already applied in getFormData
  let tabs = data.tabs.map(tab => {
    // Abbreviate "Strike the Last Word" to "STLW" for tabs, preserving suffixes/prefixes
    if (tab.toLowerCase().includes('strike the last word')) {
      return tab.replace(/strike the last word/gi, 'STLW');
    }
    return tab;
  });

  // Duplicate tabs for multiple binders
  const binderCount = data.binderCount || 1;
  if (binderCount > 1 && tabs.length > 0) {
    const originalTabs = [...tabs];
    for (let i = 1; i < binderCount; i++) {
      tabs = tabs.concat(originalTabs);
    }
  }

  // Split into pages of 20
  const pages = [];
  for (let i = 0; i < tabs.length; i += rows) {
    const pageTabs = tabs.slice(i, i + rows);
    while (pageTabs.length < rows) {
      pageTabs.push('');
    }
    pages.push(pageTabs);
  }

  if (pages.length === 0) {
    pages.push(Array(rows).fill(''));
  }

  // Helper to check if text fits at given font size
  function getFontSizeForTab(text, fontSize) {
    doc.setFontSize(fontSize);
    const lineHeight = fontSize * 0.014;
    const maxWidth = tabW - 0.066;   // 0.033" per side
    const maxHeight = tabH - 0.066;  // 0.033" per side

    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const testWidth = doc.getTextWidth(testLine);

      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    const totalHeight = lines.length * lineHeight;
    const fits = totalHeight <= maxHeight && lines.length <= 3;

    if (fits) {
      return { fits: true, lines };
    }
    return { fits: false, lines: null };
  }
  
  // Find font size that works for ALL tabs across ALL pages
  let commonFontSize = 1; // No minimum, shrink as needed
  let allPagesLineMaps = [];

  for (let fontSize = 32; fontSize >= 1; fontSize--) {
    let allFit = true;
    const tempPageMaps = [];

    for (const pageTabs of pages) {
      const tempLineMap = [];
      for (let i = 0; i < rows; i++) {
        const text = pageTabs[i].trim();
        if (!text) {
          tempLineMap.push(null);
          continue;
        }

        const result = getFontSizeForTab(text, fontSize);
        if (!result.fits) {
          allFit = false;
          break;
        }
        tempLineMap.push(result.lines);
      }
      if (!allFit) break;
      tempPageMaps.push(tempLineMap);
    }

    if (allFit) {
      commonFontSize = fontSize;
      allPagesLineMaps = tempPageMaps;
      break;
    }
  }
  
  // Draw each page
  doc.setFontSize(commonFontSize);
  const lineHeight = commonFontSize * 0.014; // Match the line height used in fitting calculation
  
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    if (pageIdx > 0) {
      doc.addPage();
    }
    
    const pageTabs = pages[pageIdx];
    const tabLineMap = allPagesLineMaps[pageIdx];
    
    // Draw borders for this page
    if (showBorders) {
      doc.setDrawColor(150, 150, 150);
      
      // Dashed pattern for outer borders and horizontals
      doc.setLineDashPattern([0.05, 0.05], 0);
      doc.setLineWidth(0.01);
      
      // Outer rectangle (dashed)
      doc.rect(leftX, startY, tabW * 2, endY - startY, 'S');
      
      // Horizontal lines between rows (dashed)
      for (let i = 1; i < rows; i++) {
        const y = startY + (i * rowGap);
        doc.line(leftX, y, leftX + tabW * 2, y);
      }
      
      // Center vertical line (solid, thinner)
      doc.setLineDashPattern([], 0);
      doc.setLineWidth(0.005);
      const centerX = leftX + tabW;
      doc.line(centerX, startY, centerX, endY);
    }
    
    // Draw text for this page
    for (let i = 0; i < rows; i++) {
      const y = startY + (i * rowGap);
      const lines = tabLineMap && tabLineMap[i];
      
      if (lines && lines.length > 0) {
        const totalTextHeight = lines.length * lineHeight;
        const startTextY = y + 0.033 + (tabH - 0.066 - totalTextHeight) / 2 + lineHeight;

        // Left column
        lines.forEach((line, lineIdx) => {
          const lineWidth = doc.getTextWidth(line);
          const lineX = leftX + 0.033 + (tabW - 0.066 - lineWidth) / 2;
          const lineY = startTextY + (lineIdx * lineHeight);
          doc.text(line, lineX, lineY);
        });

        // Right column (duplicated)
        lines.forEach((line, lineIdx) => {
          const lineWidth = doc.getTextWidth(line);
          const lineX = rightX + 0.033 + (tabW - 0.066 - lineWidth) / 2;
          const lineY = startTextY + (lineIdx * lineHeight);
          doc.text(line, lineX, lineY);
        });
      }
    }
  }
  
  return doc;
}

// Download functions
document.getElementById('downloadCover').addEventListener('click', async () => {
  const data = getFormData();
  if (!validateData(data)) return;

  const doc = await generateCoverPDF(data);
  const filename = generateFilename(data);
  doc.save(`${filename}-Cover.pdf`);
});

document.getElementById('downloadToc').addEventListener('click', async () => {
  const data = getFormData();
  if (!validateData(data)) return;

  const doc = await generateTocPDF(data);
  const filename = generateFilename(data);
  doc.save(`${filename}-Table_of_Contents.pdf`);
});

document.getElementById('downloadTabs').addEventListener('click', async () => {
  const data = getFormData();
  if (!validateData(data)) return;

  const doc = await generateTabsPDF(data);
  const filename = generateFilename(data);
  doc.save(`${filename}-Tabs.pdf`);
});

document.getElementById('generateAll').addEventListener('click', async () => {
  const data = getFormData();
  if (!validateData(data)) return;

  // Generate all three PDFs
  const coverDoc = await generateCoverPDF(data);
  const tocDoc = await generateTocPDF(data);
  const tabsDoc = await generateTabsPDF(data);

  const filename = generateFilename(data);

  // Download with slight delay to avoid browser blocking
  coverDoc.save(`${filename}-Cover.pdf`);
  setTimeout(() => tocDoc.save(`${filename}-Table_of_Contents.pdf`), 500);
  setTimeout(() => tabsDoc.save(`${filename}-Tabs.pdf`), 1000);

  showMessage('All 3 PDFs downloaded!', 'success');
});

// Validation
function validateData(data) {
  if (!data.title) {
    showMessage('Please enter a hearing title');
    return false;
  }
  return true;
}

// Helpers
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    // If already in YYYY-MM-DD format, return as-is to avoid timezone issues
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    // For ISO dates with time (e.g., from API), extract just the date portion
    if (dateStr.includes('T')) {
      return dateStr.split('T')[0];
    }
    // For other formats, parse and format
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return dateStr;
  }
}

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9_-]/gi, '_').substring(0, 50);
}

function generateFilename(data) {
  // Format: YYYY-MM-DD_CommitteeName_MeetingType
  const date = data.date || 'YYYY-MM-DD';
  const committee = data.committee || 'Committee';
  const meetingType = data.meetingType || 'hearing';

  // Sanitize committee name: replace spaces and special chars with underscores
  const sanitizedCommittee = committee.replace(/[^a-zA-Z0-9]/g, '_');

  // Capitalize meeting type
  const capitalizedMeetingType = meetingType.charAt(0).toUpperCase() + meetingType.slice(1);

  // Format date to YYYY-MM-DD if it's in a different format
  let formattedDate = date;
  if (date.includes('T')) {
    // ISO format: 2026-04-21T10:00:00-04:00
    formattedDate = date.split('T')[0];
  } else if (date.includes('/')) {
    // MM/DD/YYYY format
    const parts = date.split('/');
    if (parts.length === 3) {
      formattedDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
  }

  return `${formattedDate}_${sanitizedCommittee}_${capitalizedMeetingType}`;
}

// Restore saved state on load
restoreState();
updateTitleLabel();

// Initialize if no saved state
if (tocItems.length === 0) {
  renderTocList();
  updateTabsPreview();
}

// Update hearing title label based on meeting type
function updateTitleLabel() {
  const meetingType = document.getElementById('meetingType')?.value || 'hearing';
  const label = document.querySelector('label[for="hearingTitle"]');
  if (label) {
    label.textContent = `${meetingType.charAt(0).toUpperCase() + meetingType.slice(1)} Title *`;
  }
}

// Meeting type change listener
document.getElementById('meetingType').addEventListener('change', updateTitleLabel);

// Save state when form fields change
['committee', 'hearingTitle', 'hearingDate', 'hearingTime', 'location', 'chamber', 'meetingDate', 'meetingType'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('change', saveState);
  }
});
