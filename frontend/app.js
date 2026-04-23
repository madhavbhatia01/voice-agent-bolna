/**
 * Bolna Leads Dashboard - Frontend Logic
 * Encapsulated in an IIFE to avoid global scope pollution.
 */
(() => {
    'use strict';

    // API Configuration
    const API_BASE_URL = 'http://127.0.0.1:8000';

    // DOM Elements Cache
    const elements = {};

    /**
     * Initializes the application.
     */
    function init() {
        // Cache elements after DOM is fully parsed
        elements.leadsContainer = document.getElementById('leads-container');
        elements.pastLeadsContainer = document.getElementById('past-leads-container');
        elements.phoneInput = document.getElementById('phone-input');
        elements.makeCallBtn = document.getElementById('make-call-btn');
        elements.callStatus = document.getElementById('call-status');
        
        // Modal Elements
        elements.errorModal = document.getElementById('error-modal');
        elements.errorModalMessage = document.getElementById('error-modal-message');
        elements.closeModalBtn = document.getElementById('close-modal-btn');

        if (elements.leadsContainer || elements.pastLeadsContainer) {
            fetchLeads();
        }
        
        setupEventListeners();
    }

    /**
     * Wires up event listeners for interactive UI components.
     */
    function setupEventListeners() {
        if (elements.makeCallBtn && elements.phoneInput) {
            elements.makeCallBtn.addEventListener('click', handleMakeCall);
            
            // Allow triggering the call on "Enter" key press
            elements.phoneInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleMakeCall();
            });
        }
        
        // Modal close events
        if (elements.closeModalBtn) {
            elements.closeModalBtn.addEventListener('click', hideErrorModal);
        }
        
        // Close modal when clicking outside of it
        if (elements.errorModal) {
            elements.errorModal.addEventListener('click', (e) => {
                if (e.target === elements.errorModal) hideErrorModal();
            });
        }
    }

    /**
     * Fetches confirmed leads from the backend and renders them.
     */
    async function fetchLeads() {
        try {
            const response = await fetch(`${API_BASE_URL}/leads`);
            
            if (!response.ok) {
                throw new Error(`Server responded with HTTP ${response.status}`);
            }
            
            const leads = await response.json();
            
            leads.sort((a, b) => {
                // Default invalid dates to end of list
                const dateA = a.preferred_date || '9999-99-99';
                const dateB = b.preferred_date || '9999-99-99';
                
                if (dateA !== dateB) {
                    return dateA.localeCompare(dateB);
                }
                
                // If dates are identical, look for explicitly named time slots
                const timeA = String(a.preferred_time || '').toLowerCase();
                const timeB = String(b.preferred_time || '').toLowerCase();
                
                let weightA = 99;
                if (timeA.includes('morning')) weightA = 1;
                else if (timeA.includes('afternoon')) weightA = 2;
                
                let weightB = 99;
                if (timeB.includes('morning')) weightB = 1;
                else if (timeB.includes('afternoon')) weightB = 2;
                
                if (weightA !== weightB) {
                    return weightA - weightB;
                }
                
                // Fallback to alphabetical if both are unknown strings (e.g. "10:00 AM")
                return timeA.localeCompare(timeB);
            });
            
            const getLocalYYYYMMDD = (d) => {
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            };
            const todayStr = getLocalYYYYMMDD(new Date());

            // Split into Upcoming and Past leads
            const upcomingLeads = [];
            const pastLeads = [];

            leads.forEach(lead => {
                const date = lead.preferred_date;
                // If date exists, is valid, and strictly precedes today
                if (date && date !== 'N/A' && date < todayStr) {
                    pastLeads.push(lead);
                } else {
                    upcomingLeads.push(lead);
                }
            });
            
            renderLeadsList(upcomingLeads, elements.leadsContainer, 'No upcoming appointments scheduled yet.');
            renderLeadsList(pastLeads, elements.pastLeadsContainer, 'No past service records.');
            
        } catch (error) {
            console.error('Failed to fetch leads:', error);
            const errHtml = `
                <div class="no-data" style="color: #ef4444;">
                    Error loading leads. Is the backend server running at ${API_BASE_URL}?
                </div>`;
            elements.leadsContainer.innerHTML = errHtml;
            if (elements.pastLeadsContainer) elements.pastLeadsContainer.innerHTML = errHtml;
        }
    }

    /**
     * Renders a specific array of leads into a specific container.
     */
    function renderLeadsList(leads, container, emptyMessage) {
        if (!container) return;
        container.innerHTML = '';
        
        if (!Array.isArray(leads) || leads.length === 0) {
            container.innerHTML = `
                <div class="no-data">
                    ${emptyMessage}
                </div>`;
            return;
        }
        
        // Use document fragment for better rendering performance
        const fragment = document.createDocumentFragment();
        
        const getLocalYYYYMMDD = (d) => {
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);
        
        const todayStr = getLocalYYYYMMDD(today);
        const tomorrowStr = getLocalYYYYMMDD(tomorrow);
        
        leads.forEach(lead => {
            const row = document.createElement('div');
            
            let rowClass = 'row lead-row';
            let prefDateHtml = escapeHTML(lead.preferred_date || 'N/A');
            
            if (lead.preferred_date === todayStr) {
                rowClass += ' highlight-urgent';
                prefDateHtml += ' <span style="color: #38bdf8; font-size:0.85rem; font-weight:600; margin-left:6px;">(Today)</span>';
            } else if (lead.preferred_date === tomorrowStr) {
                rowClass += ' highlight-soon';
                prefDateHtml += ' <span style="color: #f59e0b; font-size:0.85rem; font-weight:700; margin-left:6px; letter-spacing:0.5px;">(TOMORROW)</span>';
            } else if (lead.preferred_date && lead.preferred_date !== 'N/A' && lead.preferred_date < todayStr) {
                // Dim past rows dynamically
                rowClass += ' past-row';
            }
            
            row.className = rowClass;
            
            const phone = escapeHTML(lead.phone_number || 'N/A');
            const service = escapeHTML(lead.service_type || 'General Service');
            const prefTime = escapeHTML(lead.preferred_time || 'N/A');
            
            row.innerHTML = `
                <div class="col font-medium">${phone}</div>
                <div class="col"><span class="service-badge">${service}</span></div>
                <div class="col text-secondary">${prefDateHtml}</div>
                <div class="col">${prefTime}</div>
            `;
            
            fragment.appendChild(row);
        });
        
        container.appendChild(fragment);
    }

    /**
     * Handles the logic to initiate an outbound call.
     */
    async function handleMakeCall() {
        const phone = elements.phoneInput.value.trim();
        
        // Strict Phone validation: E.164 format (e.g. +919000000000)
        const phoneRegex = /^\+[1-9]\d{1,14}$/;
        
        if (!phoneRegex.test(phone)) {
            updateCallStatus('Please enter a valid phone number (e.g. +919000000000).', '#ef4444');
            return;
        }
        
        setButtonState(true);
        updateCallStatus('Initiating call...', '#94a3b8');
        
        try {
            const response = await fetch(`${API_BASE_URL}/call`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ phone_number: phone })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }
            
            updateCallStatus('Call successfully initiated!', '#10b981');
            elements.phoneInput.value = '';
            
            // Clear success message after 4 seconds
            setTimeout(() => {
                if (elements.callStatus.textContent === 'Call successfully initiated!') {
                    elements.callStatus.textContent = '';
                }
            }, 4000);
            
        } catch (error) {
            console.error('Failed to initiate call:', error);
            updateCallStatus('', ''); // Clear inline status
            showErrorModal(error.message);
        } finally {
            setButtonState(false);
        }
    }

    /**
     * Shows the error modal overlay with dynamic text.
     */
    function showErrorModal(message) {
        if (!elements.errorModal || !elements.errorModalMessage) return;
        elements.errorModalMessage.textContent = message;
        elements.errorModal.classList.remove('hidden');
    }

    /**
     * Hides the error modal overlay.
     */
    function hideErrorModal() {
        if (!elements.errorModal) return;
        elements.errorModal.classList.add('hidden');
        
        // Clear message after animation completes
        setTimeout(() => {
            if (elements.errorModalMessage) {
                elements.errorModalMessage.textContent = '';
            }
        }, 300);
    }

    /**
     * Updates the status text and color displayed below the call input.
     */
    function updateCallStatus(message, color) {
        elements.callStatus.textContent = message;
        elements.callStatus.style.color = color;
    }

    /**
     * Toggles the loading state of the Make Call button.
     */
    function setButtonState(isLoading) {
        elements.makeCallBtn.disabled = isLoading;
        elements.makeCallBtn.style.opacity = isLoading ? '0.7' : '1';
        elements.makeCallBtn.style.cursor = isLoading ? 'not-allowed' : 'pointer';
        elements.phoneInput.disabled = isLoading;
    }

    /**
     * Very basic HTML text escaper to prevent XSS.
     */
    function escapeHTML(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Run initialization
    document.addEventListener('DOMContentLoaded', init);

})();
