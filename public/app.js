// Global variables
let csvData = [];
let matchResults = null;
let searchResults = null; // Global variable to store search results from all tabs

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeUploadArea();
    initializeBulkUpdateUploadArea();
    setupEventListeners();
});

// Setup upload area with drag and drop
function initializeUploadArea() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('csvFile');

    // Drag and drop events
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    // Tab change events
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', (e) => {
            if (e.target.id === 'match-tab' && csvData.length > 0) {
                setupMatchColumns();
            }
            if (e.target.id === 'results-tab') {
                updateResultsTab();
            }
        });
    });
}

// Handle file upload
async function handleFileUpload(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
        showAlert('Please select a CSV file', 'danger');
        return;
    }

    const formData = new FormData();
    formData.append('csvFile', file);

    showLoading('uploadLoading');
    hideElement('csvPreview');

    try {
        // For Cloudflare Workers, we'll need to handle CSV parsing on the frontend
        const text = await file.text();
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim()) {
                const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index] || '';
                });
                data.push(row);
            }
        }
        
        csvData = data;
        showCSVPreview(data, headers);
        showAlert(`Successfully uploaded ${data.length} records`, 'success');
        
        // Enable match tab if we have data
        if (csvData.length > 0) {
            document.getElementById('match-tab').disabled = false;
        }

    } catch (error) {
        console.error('Upload error:', error);
        showAlert('Error uploading file', 'danger');
    } finally {
        hideLoading('uploadLoading');
    }
}

// Show CSV preview
function showCSVPreview(data, columns) {
    const tableHeader = document.getElementById('csvTableHeader');
    const tableBody = document.getElementById('csvTableBody');

    // Clear existing content
    tableHeader.innerHTML = '';
    tableBody.innerHTML = '';

    // Add headers
    columns.forEach(column => {
        const th = document.createElement('th');
        th.textContent = column;
        tableHeader.appendChild(th);
    });

    // Add data rows (limit to first 10 for preview)
    const previewData = data.slice(0, 10);
    previewData.forEach(row => {
        const tr = document.createElement('tr');
        columns.forEach(column => {
            const td = document.createElement('td');
            td.textContent = row[column] || '';
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });

    showElement('csvPreview');
}

// Perform specific query
async function performSpecificQuery() {
  const firstName = document.getElementById('specificQueryFirstName').value.trim();
  const lastName = document.getElementById('specificQueryLastName').value.trim();
  const email = document.getElementById('specificQueryEmail').value.trim();
  const phone = document.getElementById('specificQueryPhone').value.trim();
  const pcoId = document.getElementById('specificQueryPCOID').value.trim();

  // Check if at least one field is filled
  if (!firstName && !lastName && !email && !phone && !pcoId) {
    showAlert('Please fill in at least one field for the query', 'warning');
    return;
  }

  showLoading('specificQueryLoading');
  hideElement('specificQueryResults');

  try {
    // For Cloudflare Workers, we'll use individual search endpoints
    let people = [];
    let searchInfo = {};
    
    if (firstName && lastName) {
      const nameResponse = await fetch('/api/search/name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName })
      });
      const nameResult = await nameResponse.json();
      if (nameResult.success) {
        people.push(...nameResult.data);
        searchInfo.nameSearch = `Name: ${firstName} ${lastName}`;
      }
    }
    
    if (email) {
      const emailResponse = await fetch('/api/search/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const emailResult = await emailResponse.json();
      if (emailResult.success) {
        people.push(...emailResult.data);
        searchInfo.emailSearch = `Email: ${email}`;
      }
    }
    
    if (phone) {
      const phoneResponse = await fetch('/api/search/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const phoneResult = await phoneResponse.json();
      if (phoneResult.success) {
        people.push(...phoneResult.data);
        searchInfo.phoneSearch = `Phone: ${phone}`;
      }
    }
    
    // Remove duplicates
    const uniquePeople = people.filter((person, index, self) => 
      index === self.findIndex(p => p.id === person.id)
    );
    
    const result = { success: true, data: uniquePeople, count: uniquePeople.length, searchInfo, totalFound: uniquePeople.length };

    if (result.success) {
      showSpecificQueryResults(result.data, result.searchInfo, result.totalFound);
      if (result.count > 0) {
        showAlert(`Found ${result.count} people matching your criteria`, 'success');
      } else {
        showAlert('No people found matching your criteria', 'warning');
      }
    } else {
      showAlert(result.error || 'Error performing specific query', 'danger');
    }
  } catch (error) {
    console.error('Specific query error:', error);
    showAlert('Error performing specific query', 'danger');
  } finally {
    hideLoading('specificQueryLoading');
  }
}

// Search by grade level
async function searchByGrade() {
  const grade = document.getElementById('gradeSearch').value;
  const limit = parseInt(document.getElementById('gradeLimit').value) || 50;
  
  if (!grade) {
    showAlert('Please select a grade level', 'warning');
    return;
  }

  showLoading('advancedSearchLoading');
  hideElement('advancedSearchResults');

  try {
    const response = await fetch('/api/search/grade', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grade: parseInt(grade),
        limit: limit
      })
    });

    const result = await response.json();

    if (result.success) {
      showAdvancedSearchResults(result.data, `Grade ${grade}`);
      if (result.count > 0) {
        showAlert(`Found ${result.count} people in grade ${grade}`, 'success');
      } else {
        showAlert(`No people found in grade ${grade}`, 'warning');
      }
    } else {
      showAlert(result.error || 'Error searching by grade', 'danger');
    }
  } catch (error) {
    console.error('Grade search error:', error);
    showAlert('Error searching by grade', 'danger');
  } finally {
    hideLoading('advancedSearchLoading');
  }
}

// Search by membership type
async function searchByMembership() {
  const membership = document.getElementById('membershipSearch').value;
  const limit = parseInt(document.getElementById('membershipLimit').value) || 50;
  
  if (!membership) {
    showAlert('Please select a membership type', 'warning');
    return;
  }

  showLoading('advancedSearchLoading');
  hideElement('advancedSearchResults');

  try {
    const response = await fetch('/api/search/membership', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        membership: membership,
        limit: limit
      })
    });

    const result = await response.json();

    if (result.success) {
      showAdvancedSearchResults(result.data, `Membership: ${membership}`);
      if (result.count > 0) {
        showAlert(`Found ${result.count} people with membership type "${membership}"`, 'success');
      } else {
        showAlert(`No people found with membership type "${membership}"`, 'warning');
      }
    } else {
      showAlert(result.error || 'Error searching by membership', 'danger');
    }
  } catch (error) {
    console.error('Membership search error:', error);
    showAlert('Error searching by membership', 'danger');
  } finally {
    hideLoading('advancedSearchLoading');
  }
}

// Show advanced search results
function showAdvancedSearchResults(people, searchType) {
  const tableBody = document.getElementById('advancedSearchTableBody');
  const resultsDiv = document.getElementById('advancedSearchResults');
  
  // Clear previous content
  tableBody.innerHTML = '';
  
  // Remove previous search info
  const previousInfo = resultsDiv.querySelector('.alert-info');
  if (previousInfo) {
    previousInfo.remove();
  }

  // Add search information
  const infoDiv = document.createElement('div');
  infoDiv.className = 'alert alert-info mb-3';
  infoDiv.innerHTML = `
    <i class="fas fa-info-circle"></i>
    <strong>Search Results:</strong> ${searchType} - Found ${people.length} people
  `;
  resultsDiv.insertBefore(infoDiv, resultsDiv.firstChild);

  if (people.length === 0) {
    const noResultsRow = document.createElement('tr');
    noResultsRow.innerHTML = '<td colspan="8" class="text-center text-muted">No people found</td>';
    tableBody.appendChild(noResultsRow);
  } else {
    people.forEach(person => {
      const row = document.createElement('tr');
      
      // Get person attributes
      const attrs = person.attributes || {};
      const name = `${attrs.first_name || ''} ${attrs.last_name || ''}`.trim();
      const grade = attrs.grade !== null ? attrs.grade : '';
      const membership = attrs.membership || '';
      const email = attrs.email_addresses?.[0]?.address || attrs.login_identifier || '';
      const phone = attrs.phone_numbers?.[0]?.number || '';
      const pcoId = person.id || '';
      
      // Calculate age from birthdate
      const calculateAge = (birthdate) => {
        if (!birthdate) return '';
        try {
          const birth = new Date(birthdate);
          const today = new Date();
          let age = today.getFullYear() - birth.getFullYear();
          const monthDiff = today.getMonth() - birth.getMonth();
          
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
          }
          
          return age.toString();
        } catch (e) {
          return '';
        }
      };
      
      const age = calculateAge(attrs.birthdate);
      
      row.innerHTML = `
        <td><strong>${name}</strong></td>
        <td>${age}</td>
        <td>${grade}</td>
        <td><span class="badge bg-secondary">${membership}</span></td>
        <td>${email}</td>
        <td>${phone}</td>
        <td><code>${pcoId}</code></td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="viewPersonDetails('${pcoId}')">
            <i class="fas fa-eye"></i> View Details
          </button>
          <button class="btn btn-sm btn-outline-secondary" onclick="copyPersonDetails('${pcoId}')">
            <i class="fas fa-copy"></i> Copy
          </button>
        </td>
      `;
      
      tableBody.appendChild(row);
    });
  }

  // Add "Send to Results" button
  const existingButton = resultsDiv.querySelector('.send-to-results-btn');
  if (existingButton) {
    existingButton.remove();
  }
  
  if (people.length > 0) {
    const sendButton = document.createElement('div');
    sendButton.className = 'mt-3';
    sendButton.innerHTML = `
      <button class="btn btn-success send-to-results-btn" onclick="sendToResultsFromAdvancedSearch()">
        <i class="fas fa-share"></i> Send ${people.length} Results to Results Tab
      </button>
    `;
    resultsDiv.appendChild(sendButton);
    
    // Store the data for the button click
    window.advancedSearchData = {
      people: people,
      searchType: searchType
    };
  }

  showElement('advancedSearchResults');
}

// Show specific query results
function showSpecificQueryResults(people, searchInfo, totalFound) {
    const tableBody = document.getElementById('specificQueryTableBody');
    const resultsDiv = document.getElementById('specificQueryResults');
    
    // Clear previous content
    tableBody.innerHTML = '';
    
    // Remove previous search info
    const previousInfo = resultsDiv.querySelector('.alert-info');
    if (previousInfo) {
        previousInfo.remove();
    }

    // Add search information
    if (searchInfo && searchInfo.length > 0) {
        const infoDiv = document.createElement('div');
        infoDiv.className = 'alert alert-info mb-3';
        infoDiv.innerHTML = `
            <h6><i class="fas fa-search"></i> Search Summary:</h6>
            <ul class="mb-0">
                ${searchInfo.map(info => `<li>${info}</li>`).join('')}
            </ul>
            ${totalFound > people.length ? `<small class="text-muted">Showing ${people.length} of ${totalFound} total results</small>` : ''}
        `;
        resultsDiv.insertBefore(infoDiv, resultsDiv.firstChild);
    }

    people.forEach(person => {
        const tr = document.createElement('tr');
        
        const name = `${person.attributes?.first_name || ''} ${person.attributes?.last_name || ''}`.trim();
        // Show all emails and phones, comma separated
        const emails = (person.attributes?.email_addresses || []).map(e => e.address || e.attributes?.address || '').filter(Boolean).join('<br>');
        const phones = (person.attributes?.phone_numbers || []).map(p => p.number || p.attributes?.number || '').filter(Boolean).join('<br>');
        const id = person.id || '';

        tr.innerHTML = `
            <td><strong>${name}</strong></td>
            <td>${emails}</td>
            <td>${phones}</td>
            <td><code>${id}</code></td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="viewPersonDetails('${id}')">
                    <i class="fas fa-eye"></i> View Details
                </button>
            </td>
        `;
        
        tableBody.appendChild(tr);
    });

    // Add "Send to Results" button
    const existingButton = resultsDiv.querySelector('.send-to-results-btn');
    if (existingButton) {
        existingButton.remove();
    }
    
    if (people.length > 0) {
        const sendButton = document.createElement('div');
        sendButton.className = 'mt-3';
        sendButton.innerHTML = `
            <button class="btn btn-success send-to-results-btn" onclick="sendToResultsFromSpecificQuery()">
                <i class="fas fa-share"></i> Send ${people.length} Results to Results Tab
            </button>
        `;
        resultsDiv.appendChild(sendButton);
        
        // Store the data for the button click
        window.specificQueryData = {
            people: people,
            searchInfo: searchInfo,
            totalFound: totalFound
        };
    }

    showElement('specificQueryResults');
}

// View person details
async function viewPersonDetails(personId) {
    try {
        const response = await fetch(`/person-details/${personId}`);
        const result = await response.json();

        if (result.success) {
            const person = result.data;
            
            // Format date of birth
            const formatDate = (dateString) => {
                if (!dateString) return 'Not provided';
                try {
                    return new Date(dateString).toLocaleDateString();
                } catch (e) {
                    return dateString;
                }
            };

            // Format phone numbers
            const formatPhoneNumbers = (phoneNumbers) => {
                if (!phoneNumbers || phoneNumbers.length === 0) return 'Not provided';
                return phoneNumbers.map(phone => {
                    const number = phone.number || phone.attributes?.number || '';
                    const location = phone.location || phone.attributes?.location || '';
                    const carrier = phone.carrier || phone.attributes?.carrier || '';
                    return `${number}${location ? ` (${location})` : ''}${carrier ? ` - ${carrier}` : ''}`;
                }).join('<br>');
            };

            // Format email addresses
            const formatEmailAddresses = (emailAddresses) => {
                if (!emailAddresses || emailAddresses.length === 0) return 'Not provided';
                return emailAddresses.map(email => {
                    const address = email.address || email.attributes?.address || '';
                    const location = email.location || email.attributes?.location || '';
                    return `${address}${location ? ` (${location})` : ''}`;
                }).join('<br>');
            };

            // Format addresses
            const formatAddresses = (addresses) => {
                if (!addresses || addresses.length === 0) return 'Not provided';
                return addresses.map(address => {
                    const attrs = address.attributes || address;
                    const parts = [];
                    if (attrs.street) parts.push(attrs.street);
                    if (attrs.city) parts.push(attrs.city);
                    if (attrs.state) parts.push(attrs.state);
                    if (attrs.zip) parts.push(attrs.zip);
                    if (attrs.country) parts.push(attrs.country);
                    const location = attrs.location || '';
                    return `${parts.join(', ')}${location ? ` (${location})` : ''}`;
                }).join('<br><br>');
            };

            // Add summary section for email and phone at the top
            const summaryEmails = formatEmailAddresses(person.attributes?.email_addresses);
            const summaryPhones = formatPhoneNumbers(person.attributes?.phone_numbers);

            const details = `
                <div class="modal fade" id="personDetailsModal" tabindex="-1">
                    <div class="modal-dialog modal-xl">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">
                                    <i class="fas fa-user"></i> 
                                    Person Details: ${person.attributes?.first_name || ''} ${person.attributes?.last_name || ''}
                                </h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="row mb-3">
                                    <div class="col-md-6">
                                        <strong>All Email Addresses:</strong><br>${summaryEmails}
                                    </div>
                                    <div class="col-md-6">
                                        <strong>All Phone Numbers:</strong><br>${summaryPhones}
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="col-md-6">
                                        <div class="card mb-3">
                                            <div class="card-header">
                                                <h6 class="mb-0"><i class="fas fa-info-circle"></i> Basic Information</h6>
                                            </div>
                                            <div class="card-body">
                                                <p><strong>Full Name:</strong> ${person.attributes?.first_name || ''} ${person.attributes?.last_name || ''}</p>
                                                <p><strong>PCO ID:</strong> <code>${person.id}</code></p>
                                                <p><strong>Date of Birth:</strong> ${formatDate(person.attributes?.birthdate)}</p>
                                                <p><strong>Gender:</strong> ${person.attributes?.gender || 'Not provided'}</p>
                                                <p><strong>Marital Status:</strong> ${person.attributes?.marital_status || 'Not provided'}</p>
                                                <p><strong>Created:</strong> ${formatDate(person.attributes?.created_at)}</p>
                                                <p><strong>Updated:</strong> ${formatDate(person.attributes?.updated_at)}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="card mb-3">
                                            <div class="card-header">
                                                <h6 class="mb-0"><i class="fas fa-envelope"></i> Email Addresses</h6>
                                            </div>
                                            <div class="card-body">
                                                ${formatEmailAddresses(person.attributes?.email_addresses)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="col-md-6">
                                        <div class="card mb-3">
                                            <div class="card-header">
                                                <h6 class="mb-0"><i class="fas fa-phone"></i> Phone Numbers</h6>
                                            </div>
                                            <div class="card-body">
                                                ${formatPhoneNumbers(person.attributes?.phone_numbers)}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="card mb-3">
                                            <div class="card-header">
                                                <h6 class="mb-0"><i class="fas fa-map-marker-alt"></i> Addresses</h6>
                                            </div>
                                            <div class="card-body">
                                                ${formatAddresses(person.attributes?.addresses)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="col-md-12">
                                        <div class="card">
                                            <div class="card-header">
                                                <h6 class="mb-0"><i class="fas fa-tags"></i> Additional Information</h6>
                                            </div>
                                            <div class="card-body">
                                                <div class="row">
                                                    <div class="col-md-6">
                                                        <p><strong>Anniversary:</strong> ${formatDate(person.attributes?.anniversary)}</p>
                                                        <p><strong>Baptism Date:</strong> ${formatDate(person.attributes?.baptism)}</p>
                                                        <p><strong>Membership Date:</strong> ${formatDate(person.attributes?.membership)}</p>
                                                    </div>
                                                    <div class="col-md-6">
                                                        <p><strong>Status:</strong> ${person.attributes?.status || 'Not provided'}</p>
                                                        <p><strong>Given Name:</strong> ${person.attributes?.given_name || 'Not provided'}</p>
                                                        <p><strong>Middle Name:</strong> ${person.attributes?.middle_name || 'Not provided'}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                                <button type="button" class="btn btn-primary" onclick="copyPersonDetails('${person.id}')">
                                    <i class="fas fa-copy"></i> Copy PCO ID
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            // Remove existing modal if any
            const existingModal = document.getElementById('personDetailsModal');
            if (existingModal) {
                existingModal.remove();
            }
            // Add modal to body
            document.body.insertAdjacentHTML('beforeend', details);
            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('personDetailsModal'));
            modal.show();
        } else {
            showAlert(result.error || 'Error loading person details', 'danger');
        }
    } catch (error) {
        console.error('View details error:', error);
        showAlert('Error loading person details', 'danger');
    }
}

// Copy PCO ID to clipboard
function copyPersonDetails(personId) {
    navigator.clipboard.writeText(personId).then(() => {
        showAlert('PCO ID copied to clipboard!', 'success');
    }).catch(() => {
        showAlert('Failed to copy PCO ID', 'warning');
    });
}

// Setup match columns
function setupMatchColumns() {
    if (csvData.length === 0) return;

    const columns = Object.keys(csvData[0]);
    const firstNameSelect = document.getElementById('firstNameColumn');
    const lastNameSelect = document.getElementById('lastNameColumn');
    const emailSelect = document.getElementById('emailColumn');
    const phoneSelect = document.getElementById('phoneColumn');

    // Clear existing options
    firstNameSelect.innerHTML = '';
    lastNameSelect.innerHTML = '';
    emailSelect.innerHTML = '<option value="">-- Select Email Column --</option>';
    phoneSelect.innerHTML = '<option value="">-- Select Phone Column --</option>';

    // Add options to all selects
    columns.forEach(column => {
        // First Name options
        const option1 = document.createElement('option');
        option1.value = column;
        option1.textContent = column;
        firstNameSelect.appendChild(option1);

        // Last Name options
        const option2 = document.createElement('option');
        option2.value = column;
        option2.textContent = column;
        lastNameSelect.appendChild(option2);

        // Email options
        const option3 = document.createElement('option');
        option3.value = column;
        option3.textContent = column;
        emailSelect.appendChild(option3);

        // Phone options
        const option4 = document.createElement('option');
        option4.value = column;
        option4.textContent = column;
        phoneSelect.appendChild(option4);
    });

    // Auto-select common column names
    const firstNamePatterns = ['first', 'firstname', 'first_name', 'fname'];
    const lastNamePatterns = ['last', 'lastname', 'last_name', 'lname'];
    const emailPatterns = ['email', 'e-mail', 'email_address', 'emailaddress'];
    const phonePatterns = ['phone', 'telephone', 'phone_number', 'phonenumber', 'mobile', 'cell'];

    firstNamePatterns.forEach(pattern => {
        const match = columns.find(col => col.toLowerCase().includes(pattern));
        if (match) {
            firstNameSelect.value = match;
            return;
        }
    });

    lastNamePatterns.forEach(pattern => {
        const match = columns.find(col => col.toLowerCase().includes(pattern));
        if (match) {
            lastNameSelect.value = match;
            return;
        }
    });

    emailPatterns.forEach(pattern => {
        const match = columns.find(col => col.toLowerCase().includes(pattern));
        if (match) {
            emailSelect.value = match;
            return;
        }
    });

    phonePatterns.forEach(pattern => {
        const match = columns.find(col => col.toLowerCase().includes(pattern));
        if (match) {
            phoneSelect.value = match;
            return;
        }
    });

    showElement('matchSetup');
}

// Match records
async function matchRecords() {
    if (csvData.length === 0) {
        showAlert('Please upload a CSV file first', 'warning');
        return;
    }

    const firstNameColumn = document.getElementById('firstNameColumn').value;
    const lastNameColumn = document.getElementById('lastNameColumn').value;
    const emailColumn = document.getElementById('emailColumn').value;
    const phoneColumn = document.getElementById('phoneColumn').value;

    if (!firstNameColumn && !lastNameColumn) {
        showAlert('Please select at least one name column', 'warning');
        return;
    }

    showLoading('matchLoading');
    hideElement('matchResults');

    try {
        const response = await fetch('/match-records', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                csvData,
                firstNameColumn,
                lastNameColumn,
                emailColumn,
                phoneColumn
            })
        });

        const result = await response.json();

        if (result.success) {
            matchResults = result;
            showMatchResults(result);
            showAlert(`Matching complete! ${result.summary.matchRate} match rate`, 'success');
            
            // Enable results tab
            document.getElementById('results-tab').disabled = false;
        } else {
            showAlert(result.error || 'Error matching records', 'danger');
        }
    } catch (error) {
        console.error('Match error:', error);
        showAlert('Error matching records', 'danger');
    } finally {
        hideLoading('matchLoading');
    }
}

// Show match results
function showMatchResults(result) {
    const statsContainer = document.getElementById('matchStats');
    const detailsContainer = document.getElementById('matchDetails');

    // Show statistics
    statsContainer.innerHTML = `
        <div class="col-md-3">
            <div class="stats-card">
                <div class="stats-number">${result.summary.total}</div>
                <div class="stats-label">Total Records</div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="stats-card">
                <div class="stats-number" style="color: var(--success-color);">${result.summary.matched}</div>
                <div class="stats-label">Matched</div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="stats-card">
                <div class="stats-number" style="color: var(--warning-color);">${result.summary.unmatched}</div>
                <div class="stats-label">Unmatched</div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="stats-card">
                <div class="stats-number" style="color: var(--secondary-color);">${result.summary.matchRate}</div>
                <div class="stats-label">Match Rate</div>
            </div>
        </div>
    `;

    // Show match details
    detailsContainer.innerHTML = '';

    // Show matched records
    if (result.matches.length > 0) {
        const matchesSection = document.createElement('div');
        matchesSection.innerHTML = `
            <h4 class="mt-4"><i class="fas fa-check-circle text-success"></i> Matched Records (${result.matches.length})</h4>
        `;

        result.matches.slice(0, 5).forEach(match => {
            const matchDiv = document.createElement('div');
            matchDiv.className = 'match-result';
            matchDiv.innerHTML = `
                <div class="row">
                    <div class="col-md-6">
                        <strong>CSV Record:</strong><br>
                        ${match.csvRecord.firstName || match.csvRecord.first_name || ''} ${match.csvRecord.lastName || match.csvRecord.last_name || ''}
                        ${match.csvRecord.email ? `<br><small>Email: ${match.csvRecord.email}</small>` : ''}
                        ${match.csvRecord.phone ? `<br><small>Phone: ${match.csvRecord.phone}</small>` : ''}
                    </div>
                    <div class="col-md-6">
                        <strong>PCO Match:</strong><br>
                        ${match.pcoPerson.attributes?.first_name || ''} ${match.pcoPerson.attributes?.last_name || ''}
                        ${match.pcoPerson.attributes?.email_addresses?.[0]?.address ? `<br><small>Email: ${match.pcoPerson.attributes.email_addresses[0].address}</small>` : ''}
                        ${match.pcoPerson.attributes?.phone_numbers?.[0]?.number ? `<br><small>Phone: ${match.pcoPerson.attributes.phone_numbers[0].number}</small>` : ''}
                        <br><small class="text-muted">ID: ${match.pcoPerson.id}</small>
                    </div>
                </div>
            `;
            matchesSection.appendChild(matchDiv);
        });

        if (result.matches.length > 5) {
            const moreDiv = document.createElement('div');
            moreDiv.className = 'text-center text-muted mt-2';
            moreDiv.textContent = `... and ${result.matches.length - 5} more matches`;
            matchesSection.appendChild(moreDiv);
        }

        detailsContainer.appendChild(matchesSection);
    }

    // Show unmatched records
    if (result.unmatched.length > 0) {
        const unmatchedSection = document.createElement('div');
        unmatchedSection.innerHTML = `
            <h4 class="mt-4"><i class="fas fa-exclamation-triangle text-warning"></i> Unmatched Records (${result.unmatched.length})</h4>
        `;

        result.unmatched.slice(0, 5).forEach(unmatch => {
            const unmatchDiv = document.createElement('div');
            unmatchDiv.className = 'unmatch-result';
            unmatchDiv.innerHTML = `
                <div class="row">
                    <div class="col-md-8">
                        <strong>CSV Record:</strong><br>
                        ${unmatch.record.firstName || unmatch.record.first_name || ''} ${unmatch.record.lastName || unmatch.record.last_name || ''}
                    </div>
                    <div class="col-md-4">
                        <strong>Reason:</strong><br>
                        <small class="text-muted">${unmatch.reason}</small>
                    </div>
                </div>
            `;
            unmatchedSection.appendChild(unmatchDiv);
        });

        if (result.unmatched.length > 5) {
            const moreDiv = document.createElement('div');
            moreDiv.className = 'text-center text-muted mt-2';
            moreDiv.textContent = `... and ${result.unmatched.length - 5} more unmatched`;
            unmatchedSection.appendChild(moreDiv);
        }

        detailsContainer.appendChild(unmatchedSection);
    }

    // Add "Send to Results" button for matched PCO people
    if (result.matches.length > 0) {
        const sendButton = document.createElement('div');
        sendButton.className = 'mt-3';
        
        // Extract PCO people from matches
        const pcoPeople = result.matches.map(match => match.pcoPerson);
        
        sendButton.innerHTML = `
            <button class="btn btn-success" onclick="sendToResults(${JSON.stringify(pcoPeople)}, 'CSV Match Results', {totalMatches: ${result.matches.length}, totalUnmatched: ${result.unmatched.length}, matchRate: '${result.summary.matchRate}'})">
                <i class="fas fa-share"></i> Send ${result.matches.length} Matched PCO People to Results Tab
            </button>
        `;
        detailsContainer.appendChild(sendButton);
    }

    showElement('matchResults');
}

// Export results
async function exportResults() {
    const filename = document.getElementById('exportFilename').value.trim() || 'pco-results';

    if (searchResults && searchResults.type === 'search') {
        // Export search results
        try {
            const response = await fetch('/export-search-results', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    people: searchResults.people,
                    searchType: searchResults.searchType,
                    searchInfo: searchResults.searchInfo,
                    filename
                })
            });

            const result = await response.json();

            if (result.success) {
                // Trigger file download
                const downloadUrl = result.downloadUrl;
                if (downloadUrl) {
                    const link = document.createElement('a');
                    link.href = downloadUrl;
                    link.download = '';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
                showAlert(`Successfully exported ${result.recordCount} search results. Download started.`, 'success');
            } else {
                showAlert(result.error || 'Error exporting search results', 'danger');
            }
        } catch (error) {
            console.error('Export search results error:', error);
            showAlert('Error exporting search results', 'danger');
        }
    } else if (matchResults && matchResults.matches) {
        // Export match results
        try {
            const response = await fetch('/export-results', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    matches: matchResults.matches,
                    unmatched: matchResults.unmatched,
                    filename
                })
            });

            const result = await response.json();

            if (result.success) {
                // Trigger file download
                const downloadUrl = result.downloadUrl;
                if (downloadUrl) {
                    const link = document.createElement('a');
                    link.href = downloadUrl;
                    link.download = '';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
                showAlert(`Successfully exported ${result.recordCount} records. Download started.`, 'success');
            } else {
                showAlert(result.error || 'Error exporting results', 'danger');
            }
        } catch (error) {
            console.error('Export error:', error);
            showAlert('Error exporting results', 'danger');
        }
    } else {
        showAlert('No results to export', 'warning');
    }
}

// Export unmatched records
async function exportUnmatched() {
    if (!matchResults || !matchResults.unmatched) {
        showAlert('No unmatched results to export', 'warning');
        return;
    }

    const filename = document.getElementById('exportFilename').value.trim() || 'unmatched-records';

    try {
        const response = await fetch('/export-unmatched', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                unmatched: matchResults.unmatched,
                filename
            })
        });

        const result = await response.json();

        if (result.success) {
            // Trigger file download
            const downloadUrl = result.downloadUrl;
            if (downloadUrl) {
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = '';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
            showAlert(`Successfully exported ${result.recordCount} unmatched records. Download started.`, 'success');
        } else {
            showAlert(result.error || 'Error exporting unmatched results', 'danger');
        }
    } catch (error) {
        console.error('Export unmatched error:', error);
        showAlert('Error exporting unmatched results', 'danger');
    }
}

// Send search results to results tab
function sendToResults(people, searchType, searchInfo = {}) {
    searchResults = {
        type: 'search',
        people: people,
        searchType: searchType,
        searchInfo: searchInfo,
        timestamp: new Date().toISOString()
    };
    
    // Switch to results tab
    const resultsTab = document.getElementById('results-tab');
    const resultsTabInstance = new bootstrap.Tab(resultsTab);
    resultsTabInstance.show();
    
    // Update results tab
    updateResultsTab();
    
    showAlert(`Sent ${people.length} results to the Results tab`, 'success');
}

// Helper function for specific query results
function sendToResultsFromSpecificQuery() {
    if (window.specificQueryData) {
        sendToResults(
            window.specificQueryData.people, 
            'Specific Query', 
            {query: window.specificQueryData.searchInfo, totalFound: window.specificQueryData.totalFound}
        );
    }
}

// Helper function for advanced search results
function sendToResultsFromAdvancedSearch() {
    if (window.advancedSearchData) {
        sendToResults(
            window.advancedSearchData.people, 
            window.advancedSearchData.searchType, 
            {query: window.advancedSearchData.searchType}
        );
    }
}

// Add this function near the top or after matchRecords
function updateResultsTab() {
    const exportSection = document.getElementById('exportSection');
    const resultsSummary = document.getElementById('resultsSummary');
    
    if (searchResults && searchResults.type === 'search') {
        exportSection.style.display = 'block';
        const people = searchResults.people;
        const searchType = searchResults.searchType;
        const searchInfo = searchResults.searchInfo;
        
        resultsSummary.innerHTML = `
            <div class="alert alert-info">
                <h5><i class="fas fa-search"></i> Search Results Ready for Export</h5>
                <p><strong>Search Type:</strong> ${searchType}</p>
                <p><strong>Results Found:</strong> ${people.length} people</p>
                ${searchInfo.query ? `<p><strong>Search Query:</strong> ${searchInfo.query}</p>` : ''}
                ${searchInfo.totalFound ? `<p><strong>Total Available:</strong> ${searchInfo.totalFound} people</p>` : ''}
                <p><strong>Timestamp:</strong> ${new Date(searchResults.timestamp).toLocaleString()}</p>
            </div>
        `;
    } else if (matchResults && matchResults.matches && matchResults.matches.length > 0) {
        exportSection.style.display = 'block';
        resultsSummary.innerHTML = `
            <div class="alert alert-success">Ready to export <strong>${matchResults.matches.length}</strong> matches.</div>
        `;
    } else {
        exportSection.style.display = 'none';
        resultsSummary.innerHTML = `
            <div class="alert alert-warning">No results to export. Please run a search or match first.</div>
        `;
    }
}

// Utility functions
function showLoading(elementId) {
    document.getElementById(elementId).style.display = 'block';
}

function hideLoading(elementId) {
    document.getElementById(elementId).style.display = 'none';
}

function showElement(elementId) {
    document.getElementById(elementId).style.display = 'block';
}

function hideElement(elementId) {
    document.getElementById(elementId).style.display = 'none';
}

function showAlert(message, type) {
    // Remove existing alerts
    const existingAlerts = document.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());

    // Create new alert
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    // Insert at the top of the content area
    const content = document.querySelector('.content');
    content.insertBefore(alertDiv, content.firstChild);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
} 

// Bulk Update Functions

// Initialize bulk update upload area
function initializeBulkUpdateUploadArea() {
    const uploadArea = document.getElementById('bulkUpdateUploadArea');
    const fileInput = document.getElementById('bulkUpdateCsvFile');

    if (!uploadArea || !fileInput) return;

    // Drag and drop events
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleBulkUpdateFileUpload(files[0]);
        }
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleBulkUpdateFileUpload(e.target.files[0]);
        }
    });
}

// Handle bulk update file upload
async function handleBulkUpdateFileUpload(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
        showAlert('Please select a CSV file', 'danger');
        return;
    }

    const formData = new FormData();
    formData.append('csvFile', file);

    showLoading('bulkUpdateLoading');
    hideElement('bulkUpdatePreview');
    hideElement('bulkUpdateResults');

    try {
        const response = await fetch('/upload-csv', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            window.bulkUpdateData = result.data;
            showBulkUpdatePreview(result.data, result.columns);
            showAlert(`Successfully uploaded ${result.count} records for bulk update`, 'success');
        } else {
            showAlert(result.error || 'Error uploading file', 'danger');
        }
    } catch (error) {
        console.error('Bulk update upload error:', error);
        showAlert('Error uploading file', 'danger');
    } finally {
        hideLoading('bulkUpdateLoading');
    }
}

// Show bulk update CSV preview
function showBulkUpdatePreview(data, columns) {
    const tableHeader = document.getElementById('bulkUpdateTableHeader');
    const tableBody = document.getElementById('bulkUpdateTableBody');

    // Clear existing content
    tableHeader.innerHTML = '';
    tableBody.innerHTML = '';

    // Add headers
    columns.forEach(column => {
        const th = document.createElement('th');
        th.textContent = column;
        tableHeader.appendChild(th);
    });

    // Add data rows (limit to first 10 for preview)
    const previewData = data.slice(0, 10);
    previewData.forEach(row => {
        const tr = document.createElement('tr');
        columns.forEach(column => {
            const td = document.createElement('td');
            td.textContent = row[column] || '';
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });

    showElement('bulkUpdatePreview');
}

// Download bulk update template
async function downloadBulkUpdateTemplate() {
    try {
        const response = await fetch('/api/download-template');
        
        if (response.ok) {
            // Get the CSV content directly
            const csvContent = await response.text();
            
            // Create blob and download
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'pco-bulk-update-template.csv';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            showAlert('Template downloaded successfully', 'success');
        } else {
            const errorData = await response.json();
            showAlert(errorData.error || 'Error downloading template', 'danger');
        }
    } catch (error) {
        console.error('Template download error:', error);
        showAlert('Error downloading template', 'danger');
    }
}

// Process bulk update
async function processBulkUpdate() {
    if (!window.bulkUpdateData || window.bulkUpdateData.length === 0) {
        showAlert('No data to process. Please upload a CSV file first.', 'warning');
        return;
    }

    showLoading('bulkUpdateLoading');
    hideElement('bulkUpdateResults');

    try {
        const response = await fetch('/api/bulk-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ records: window.bulkUpdateData })
        });

        const result = await response.json();

        if (result.success) {
            showBulkUpdateResults(result.results, result.summary);
            showAlert(`Bulk update completed: ${result.summary.successful} successful, ${result.summary.errors} errors`, 
                     result.summary.errors > 0 ? 'warning' : 'success');
        } else {
            showAlert(result.error || 'Error processing bulk update', 'danger');
        }
    } catch (error) {
        console.error('Bulk update error:', error);
        showAlert('Error processing bulk update', 'danger');
    } finally {
        hideLoading('bulkUpdateLoading');
    }
}

// Show bulk update results
function showBulkUpdateResults(results, summary) {
    const summaryDiv = document.getElementById('bulkUpdateSummary');
    const tableBody = document.getElementById('bulkUpdateResultsTableBody');

    // Clear existing content
    tableBody.innerHTML = '';

    // Show summary
    summaryDiv.innerHTML = `
        <div class="row mb-3">
            <div class="col-md-3">
                <div class="stats-card">
                    <div class="stats-number">${summary.total}</div>
                    <div class="stats-label">Total Records</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stats-card">
                    <div class="stats-number text-success">${summary.successful}</div>
                    <div class="stats-label">Successful</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stats-card">
                    <div class="stats-number text-danger">${summary.errors}</div>
                    <div class="stats-label">Errors</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stats-card">
                    <div class="stats-number text-primary">${((summary.successful / summary.total) * 100).toFixed(1)}%</div>
                    <div class="stats-label">Success Rate</div>
                </div>
            </div>
        </div>
    `;

    // Show results table
    results.forEach(result => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${result.pcoId}</td>
            <td>${result.name}</td>
            <td>
                <span class="badge ${result.status === 'success' ? 'bg-success' : 'bg-danger'}">
                    ${result.status}
                </span>
            </td>
            <td>${result.message}</td>
        `;
        tableBody.appendChild(tr);
    });

    showElement('bulkUpdateResults');
}

// Clear bulk update preview
function clearBulkUpdatePreview() {
    hideElement('bulkUpdatePreview');
    hideElement('bulkUpdateResults');
    window.bulkUpdateData = null;
    document.getElementById('bulkUpdateCsvFile').value = '';
}

// Convert data to CSV format
function convertToCSV(data) {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    
    for (const row of data) {
        const values = headers.map(header => {
            const value = row[header] || '';
            // Escape commas and quotes
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        });
        csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
} 