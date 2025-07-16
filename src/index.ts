/**
 * PCO Query App - Cloudflare Worker Version
 * 
 * This worker provides a comprehensive interface for querying Planning Center Online
 * people data with search, export, and bulk update capabilities.
 */

// Types for PCO API responses
interface PCOPerson {
  id: string;
  attributes: {
    first_name: string;
    last_name: string;
    name: string;
    birthdate?: string;
    gender?: string;
    grade?: number;
    membership?: string;
    status: string;
    medical_notes?: string;
    login_identifier?: string;
    child: boolean;
    created_at: string;
    updated_at: string;
  };
  relationships: {
    phone_numbers?: {
      data: Array<{ type: string; id: string }>;
    };
    addresses?: {
      data: Array<{ type: string; id: string }>;
    };
  };
}

interface PCOPhoneNumber {
  id: string;
  attributes: {
    number: string;
    primary: boolean;
    location: string;
    carrier?: string;
  };
}

interface PCOEmail {
  id: string;
  attributes: {
    address: string;
    primary: boolean;
    location: string;
  };
}

interface PCOAddress {
  id: string;
  attributes: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    location: string;
  };
}

// API Response types
interface PCOApiResponse<T> {
  data: T;
  included?: any[];
  meta?: any;
}

// Request body types
interface NameSearchRequest {
  firstName: string;
  lastName: string;
}

interface EmailSearchRequest {
  email: string;
}

interface PhoneSearchRequest {
  phone: string;
}

interface GradeSearchRequest {
  grade: number;
  limit?: number;
}

interface MembershipSearchRequest {
  membership: string;
  limit?: number;
}

interface PersonDetailsRequest {
  personId: string;
}

interface ExportRequest {
  data: any[];
  filename: string;
}

interface BulkUpdateRequest {
  records: Record<string, any>[];
}

// Rate Limiter for Cloudflare Workers
class RateLimiter {
  private requestTimes: number[] = [];
  private maxRequestsPerSecond: number;

  constructor(maxRequestsPerSecond = 2) {
    this.maxRequestsPerSecond = maxRequestsPerSecond;
  }

  async waitForNextRequest(): Promise<void> {
    const now = Date.now();
    
    // Remove requests older than 1 second
    this.requestTimes = this.requestTimes.filter(time => now - time < 1000);
    
    // If we've made too many requests in the last second, wait
    if (this.requestTimes.length >= this.maxRequestsPerSecond) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = 1000 - (now - oldestRequest);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    this.requestTimes.push(Date.now());
  }
}

// PCO API Client
class PCOAPI {
  private baseUrl = 'https://api.planningcenteronline.com/people/v2';
  private rateLimiter: RateLimiter;

  constructor(private applicationId: string, private secret: string) {
    this.rateLimiter = new RateLimiter(2);
  }

  private getHeaders(): HeadersInit {
    const auth = btoa(`${this.applicationId}:${this.secret}`);
    return {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    };
  }

  private async makeRequest(url: string, options: RequestInit = {}): Promise<Response> {
    await this.rateLimiter.waitForNextRequest();
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.makeRequest(url, options);
    }

    return response;
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const data = await response.json() as T;
    return data;
  }

  async searchPeopleByName(firstName: string, lastName: string, limit = 10): Promise<PCOPerson[]> {
    const url = `${this.baseUrl}/people?where[first_name]=${encodeURIComponent(firstName)}&where[last_name]=${encodeURIComponent(lastName)}&per_page=${limit}`;
    const response = await this.makeRequest(url);
    
    if (!response.ok) {
      throw new Error(`PCO API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await this.parseResponse<PCOApiResponse<PCOPerson[]>>(response);
    return data.data || [];
  }

  async searchPeopleByEmail(email: string, limit = 10): Promise<PCOPerson[]> {
    const url = `${this.baseUrl}/people?where[emails_address]=${encodeURIComponent(email)}&per_page=${limit}`;
    const response = await this.makeRequest(url);
    
    if (!response.ok) {
      throw new Error(`PCO API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await this.parseResponse<PCOApiResponse<PCOPerson[]>>(response);
    return data.data || [];
  }

  async searchPeopleByPhone(phone: string, limit = 10): Promise<PCOPerson[]> {
    // Try multiple phone number formats
    const phoneFormats = [
      phone,
      `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`,
      `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`,
    ];

    const allPeople: PCOPerson[] = [];
    
    for (const phoneFormat of phoneFormats) {
      const url = `${this.baseUrl}/people?where[phone_numbers_number]=${encodeURIComponent(phoneFormat)}&per_page=${limit}`;
      const response = await this.makeRequest(url);
      
      if (response.ok) {
        const data = await this.parseResponse<PCOApiResponse<PCOPerson[]>>(response);
        if (data.data) {
          allPeople.push(...data.data);
        }
      }
    }

    // Remove duplicates and limit results
    const uniquePeople = allPeople.filter((person, index, self) => 
      index === self.findIndex(p => p.id === person.id)
    );

    return uniquePeople.slice(0, limit);
  }

  async searchPeopleByGrade(grade: number, limit = 50): Promise<PCOPerson[]> {
    const url = `${this.baseUrl}/people?where[grade]=${grade}&per_page=${limit}`;
    const response = await this.makeRequest(url);
    
    if (!response.ok) {
      throw new Error(`PCO API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await this.parseResponse<PCOApiResponse<PCOPerson[]>>(response);
    return data.data || [];
  }

  async searchPeopleByMembership(membership: string, limit = 50): Promise<PCOPerson[]> {
    const url = `${this.baseUrl}/people?where[membership]=${encodeURIComponent(membership)}&per_page=${limit}`;
    const response = await this.makeRequest(url);
    
    if (!response.ok) {
      throw new Error(`PCO API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await this.parseResponse<PCOApiResponse<PCOPerson[]>>(response);
    return data.data || [];
  }

  async getPersonById(personId: string): Promise<PCOPerson | null> {
    const url = `${this.baseUrl}/people/${personId}?include=phone_numbers,emails,addresses`;
    const response = await this.makeRequest(url);
    
    if (!response.ok) {
      return null;
    }
    
    const data = await this.parseResponse<PCOApiResponse<PCOPerson>>(response);
    return data.data || null;
  }

  async getPhoneNumbers(personId: string): Promise<PCOPhoneNumber[]> {
    const url = `${this.baseUrl}/people/${personId}/phone_numbers`;
    const response = await this.makeRequest(url);
    
    if (!response.ok) {
      return [];
    }
    
    const data = await this.parseResponse<PCOApiResponse<PCOPhoneNumber[]>>(response);
    return data.data || [];
  }

  async getEmails(personId: string): Promise<PCOEmail[]> {
    const url = `${this.baseUrl}/people/${personId}/emails`;
    const response = await this.makeRequest(url);
    
    if (!response.ok) {
      return [];
    }
    
    const data = await this.parseResponse<PCOApiResponse<PCOEmail[]>>(response);
    return data.data || [];
  }

  async getAddresses(personId: string): Promise<PCOAddress[]> {
    const url = `${this.baseUrl}/people/${personId}/addresses`;
    const response = await this.makeRequest(url);
    
    if (!response.ok) {
      return [];
    }
    
    const data = await this.parseResponse<PCOApiResponse<PCOAddress[]>>(response);
    return data.data || [];
  }

  async updatePerson(personId: string, updateData: Record<string, any>): Promise<{ success: boolean; error?: string }> {
    const url = `${this.baseUrl}/people/${personId}`;
    const payload = {
      data: {
        type: 'Person',
        id: personId,
        attributes: updateData
      }
    };

    try {
      const response = await this.makeRequest(url, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`PCO API update failed for person ${personId}:`, response.status, errorText);
        return { 
          success: false, 
          error: `PCO API error (${response.status}): ${errorText}` 
        };
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Exception updating person ${personId}:`, errorMessage);
      return { 
        success: false, 
        error: `Exception: ${errorMessage}` 
      };
    }
  }

  async createPerson(personData: Record<string, any>): Promise<{ success: boolean; personId?: string; error?: string }> {
    const url = `${this.baseUrl}/people`;
    const payload = {
      data: {
        type: 'Person',
        attributes: personData
      }
    };

    try {
      const response = await this.makeRequest(url, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`PCO API create failed:`, response.status, errorText);
        return { 
          success: false, 
          error: `PCO API error (${response.status}): ${errorText}` 
        };
      }

      const responseData = await this.parseResponse<PCOApiResponse<PCOPerson>>(response);
      const newPersonId = responseData.data?.id;
      
      return { 
        success: true, 
        personId: newPersonId 
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Exception creating person:`, errorMessage);
      return { 
        success: false, 
        error: `Exception: ${errorMessage}` 
      };
    }
  }

  async createPhoneNumber(personId: string, phoneData: Record<string, any>): Promise<{ success: boolean; error?: string }> {
    const url = `${this.baseUrl}/people/${personId}/phone_numbers`;
    const payload = {
      data: {
        type: 'PhoneNumber',
        attributes: phoneData
      }
    };

    try {
      const response = await this.makeRequest(url, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`PCO API phone number create failed for person ${personId}:`, response.status, errorText);
        return { 
          success: false, 
          error: `Phone number creation failed (${response.status}): ${errorText}` 
        };
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Exception creating phone number for person ${personId}:`, errorMessage);
      return { 
        success: false, 
        error: `Phone number exception: ${errorMessage}` 
      };
    }
  }

  async createEmail(personId: string, emailData: Record<string, any>): Promise<{ success: boolean; error?: string }> {
    const url = `${this.baseUrl}/people/${personId}/emails`;
    const payload = {
      data: {
        type: 'Email',
        attributes: emailData
      }
    };

    try {
      const response = await this.makeRequest(url, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`PCO API email create failed for person ${personId}:`, response.status, errorText);
        return { 
          success: false, 
          error: `Email creation failed (${response.status}): ${errorText}` 
        };
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Exception creating email for person ${personId}:`, errorMessage);
      return { 
        success: false, 
        error: `Email exception: ${errorMessage}` 
      };
    }
  }

  async createAddress(personId: string, addressData: Record<string, any>): Promise<{ success: boolean; error?: string }> {
    const url = `${this.baseUrl}/people/${personId}/addresses`;
    const payload = {
      data: {
        type: 'Address',
        attributes: addressData
      }
    };

    try {
      const response = await this.makeRequest(url, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`PCO API address create failed for person ${personId}:`, response.status, errorText);
        return { 
          success: false, 
          error: `Address creation failed (${response.status}): ${errorText}` 
        };
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Exception creating address for person ${personId}:`, errorMessage);
      return { 
        success: false, 
        error: `Address exception: ${errorMessage}` 
      };
    }
  }

  async upsertPerson(personId: string | null, personData: Record<string, any>): Promise<{ success: boolean; personId?: string; action: 'created' | 'updated'; error?: string }> {
    // If no personId provided or it's empty/null, create new person
    if (!personId || personId.trim() === '' || personId === 'N/A') {
      console.log('Creating new person with data:', personData);
      const result = await this.createPerson(personData);
      return {
        success: result.success,
        personId: result.personId,
        action: 'created',
        error: result.error
      };
    }

    // Check if person exists
    const existingPerson = await this.getPersonById(personId);
    
    if (!existingPerson) {
      // Person doesn't exist, create new one
      console.log(`Person ${personId} not found, creating new person with data:`, personData);
      const result = await this.createPerson(personData);
      return {
        success: result.success,
        personId: result.personId,
        action: 'created',
        error: result.error
      };
    } else {
      // Person exists, update them
      console.log(`Person ${personId} found, updating with data:`, personData);
      const result = await this.updatePerson(personId, personData);
      return {
        success: result.success,
        personId: personId,
        action: 'updated',
        error: result.error
      };
    }
  }

  async upsertPersonWithDetails(personId: string | null, record: Record<string, any>): Promise<{ success: boolean; personId?: string; action: 'created' | 'updated'; error?: string; details?: string[] }> {
    // Extract person data (basic attributes)
    const personData: Record<string, any> = {};
    if (record['First Name']) personData.first_name = record['First Name'];
    if (record['Last Name']) personData.last_name = record['Last Name'];
    if (record['Membership']) personData.membership = record['Membership'];
    if (record['Grade']) personData.grade = parseInt(record['Grade']) || record['Grade'];
    if (record['Status']) personData.status = record['Status'];
    if (record['Birthdate']) personData.birthdate = record['Birthdate'];
    if (record['Gender']) personData.gender = record['Gender'];
    if (record['Medical Notes']) personData.medical_notes = record['Medical Notes'];

    // First, create or update the person
    const personResult = await this.upsertPerson(personId, personData);
    
    if (!personResult.success || !personResult.personId) {
      return personResult;
    }

    const finalPersonId = personResult.personId;
    const details: string[] = [];

    // Create phone numbers
    const phoneNumbers = [
      { number: record['Mobile Phone Number'], location: 'Mobile', primary: true },
      { number: record['Home Phone Number'], location: 'Home', primary: false },
      { number: record['Work Phone Number'], location: 'Work', primary: false }
    ].filter(phone => phone.number && phone.number.trim());

    for (const phone of phoneNumbers) {
      const phoneResult = await this.createPhoneNumber(finalPersonId, {
        number: phone.number,
        location: phone.location,
        primary: phone.primary
      });
      if (phoneResult.success) {
        details.push(`${phone.location} phone added`);
      } else {
        details.push(`${phone.location} phone failed: ${phoneResult.error}`);
      }
    }

    // Create emails
    const emails = [
      { address: record['Home Email'], location: 'Home', primary: true },
      { address: record['Work Email'], location: 'Work', primary: false }
    ].filter(email => email.address && email.address.trim());

    for (const email of emails) {
      const emailResult = await this.createEmail(finalPersonId, {
        address: email.address,
        location: email.location,
        primary: email.primary
      });
      if (emailResult.success) {
        details.push(`${email.location} email added`);
      } else {
        details.push(`${email.location} email failed: ${emailResult.error}`);
      }
    }

    // Create address
    if (record['Home Address Street Line 1'] && record['Home Address City']) {
      const addressData = {
        street: record['Home Address Street Line 1'],
        city: record['Home Address City'],
        state: record['Home Address State'] || '',
        zip: record['Home Address Zip Code'] || '',
        country: 'US',
        location: 'Home'
      };

      const addressResult = await this.createAddress(finalPersonId, addressData);
      if (addressResult.success) {
        details.push('Home address added');
      } else {
        details.push(`Address failed: ${addressResult.error}`);
      }
    }

    return {
      success: personResult.success,
      personId: finalPersonId,
      action: personResult.action,
      error: personResult.error,
      details: details
    };
  }
}

// CSV Utilities
function generateCSV(data: any[], headers: string[]): string {
  const csvRows = [headers.join(',')];
  
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header] || '';
      // Escape commas and quotes in CSV
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}

// Type guard functions
function isNameSearchRequest(obj: unknown): obj is NameSearchRequest {
  return typeof obj === 'object' && obj !== null && 
         'firstName' in obj && 'lastName' in obj &&
         typeof (obj as any).firstName === 'string' && 
         typeof (obj as any).lastName === 'string';
}

function isEmailSearchRequest(obj: unknown): obj is EmailSearchRequest {
  return typeof obj === 'object' && obj !== null && 
         'email' in obj && typeof (obj as any).email === 'string';
}

function isPhoneSearchRequest(obj: unknown): obj is PhoneSearchRequest {
  return typeof obj === 'object' && obj !== null && 
         'phone' in obj && typeof (obj as any).phone === 'string';
}

function isGradeSearchRequest(obj: unknown): obj is GradeSearchRequest {
  return typeof obj === 'object' && obj !== null && 
         'grade' in obj && typeof (obj as any).grade === 'number';
}

function isMembershipSearchRequest(obj: unknown): obj is MembershipSearchRequest {
  return typeof obj === 'object' && obj !== null && 
         'membership' in obj && typeof (obj as any).membership === 'string';
}

function isPersonDetailsRequest(obj: unknown): obj is PersonDetailsRequest {
  return typeof obj === 'object' && obj !== null && 
         'personId' in obj && typeof (obj as any).personId === 'string';
}

function isExportRequest(obj: unknown): obj is ExportRequest {
  return typeof obj === 'object' && obj !== null && 
         'data' in obj && 'filename' in obj &&
         Array.isArray((obj as any).data) && 
         typeof (obj as any).filename === 'string';
}

function isBulkUpdateRequest(obj: unknown): obj is BulkUpdateRequest {
  return typeof obj === 'object' && obj !== null && 
         'records' in obj && Array.isArray((obj as any).records);
}

// Environment interface
interface Env {
  PCO_APPLICATION_ID: string;
  PCO_SECRET: string;
  ASSETS: Fetcher;
}

// Main Worker Handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
    const pcoAPI = new PCOAPI(env.PCO_APPLICATION_ID, env.PCO_SECRET);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Serve static files
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const html = await env.ASSETS.fetch(request);
        return new Response(html.body, {
          headers: { ...corsHeaders, 'Content-Type': 'text/html' }
        });
      }

      if (url.pathname === '/app.js') {
        const js = await env.ASSETS.fetch(request);
        return new Response(js.body, {
          headers: { ...corsHeaders, 'Content-Type': 'application/javascript' }
        });
      }

      // API Routes
		switch (url.pathname) {
        case '/api/search/name': {
          const body = await request.json();
          if (!isNameSearchRequest(body)) {
            return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          const people = await pcoAPI.searchPeopleByName(body.firstName, body.lastName);
          return new Response(JSON.stringify({ success: true, data: people }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        case '/api/search/email': {
          const body = await request.json();
          if (!isEmailSearchRequest(body)) {
            return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          const people = await pcoAPI.searchPeopleByEmail(body.email);
          return new Response(JSON.stringify({ success: true, data: people }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        case '/api/search/phone': {
          const body = await request.json();
          if (!isPhoneSearchRequest(body)) {
            return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          const people = await pcoAPI.searchPeopleByPhone(body.phone);
          return new Response(JSON.stringify({ success: true, data: people }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        case '/api/search/grade': {
          const body = await request.json();
          if (!isGradeSearchRequest(body)) {
            return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          const people = await pcoAPI.searchPeopleByGrade(body.grade, body.limit || 50);
          return new Response(JSON.stringify({ success: true, data: people }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        case '/api/search/membership': {
          const body = await request.json();
          if (!isMembershipSearchRequest(body)) {
            return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          const people = await pcoAPI.searchPeopleByMembership(body.membership, body.limit || 50);
          return new Response(JSON.stringify({ success: true, data: people }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        case '/api/person-details': {
          const body = await request.json();
          if (!isPersonDetailsRequest(body)) {
            return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          const person = await pcoAPI.getPersonById(body.personId);
          
          if (!person) {
            return new Response(JSON.stringify({ success: false, error: 'Person not found' }), {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          return new Response(JSON.stringify({ success: true, data: person }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        case '/api/export': {
          const body = await request.json();
          if (!isExportRequest(body)) {
            return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          const csv = generateCSV(body.data, Object.keys(body.data[0] || {}));
          
          return new Response(csv, {
            headers: {
              ...corsHeaders,
              'Content-Type': 'text/csv',
              'Content-Disposition': `attachment; filename="${body.filename}"`
            }
          });
        }

        case '/api/download-template': {
          const templateData = [
            {
              'Person ID': '12345678',
              'Name Prefix': 'Mr.',
              'Given Name': 'John',
              'First Name': 'John',
              'Nickname': 'Johnny',
              'Middle Name': 'Michael',
              'Last Name': 'Doe',
              'Name Suffix': 'Jr.',
              'Birthdate': '1990-05-15',
              'Anniversary': '2015-06-20',
              'Gender': 'Male',
              'Grade': '5',
              'School': 'Elementary School',
              'Medical Notes': 'Allergic to peanuts',
              'Child': 'false',
              'Marital Status': 'Married',
              'Status': 'active',
              'Membership': 'Member',
              'Inactive Reason': '',
              'Inactive Date': '',
              'Mobile Phone Number': '(555) 123-4567',
              'Home Phone Number': '(555) 987-6543',
              'Work Phone Number': '(555) 456-7890',
              'Home Email': 'john.doe@example.com',
              'Work Email': 'john.doe@work.com',
              'Home Address Street Line 1': '123 Main St',
              'Home Address City': 'Anytown',
              'Home Address State': 'TX',
              'Home Address Zip Code': '12345'
            },
            {
              'Person ID': '',
              'Name Prefix': 'Ms.',
              'Given Name': 'Jane',
              'First Name': 'Jane',
              'Nickname': '',
              'Middle Name': 'Elizabeth',
              'Last Name': 'Smith',
              'Name Suffix': '',
              'Birthdate': '1985-08-22',
              'Anniversary': '',
              'Gender': 'Female',
              'Grade': '',
              'School': '',
              'Medical Notes': '',
              'Child': 'false',
              'Marital Status': 'Single',
              'Status': 'active',
              'Membership': 'Attender',
              'Inactive Reason': '',
              'Inactive Date': '',
              'Mobile Phone Number': '(555) 999-8888',
              'Home Phone Number': '',
              'Work Phone Number': '',
              'Home Email': 'jane.smith@example.com',
              'Work Email': '',
              'Home Address Street Line 1': '456 Oak Ave',
              'Home Address City': 'Somewhere',
              'Home Address State': 'CA',
              'Home Address Zip Code': '54321'
            }
          ];

          const csv = generateCSV(templateData, Object.keys(templateData[0]));
          
          return new Response(csv, {
            headers: {
              ...corsHeaders,
              'Content-Type': 'text/csv',
              'Content-Disposition': 'attachment; filename="pco-bulk-update-template.csv"'
            }
          });
        }

        case '/api/bulk-update': {
          const body = await request.json();
          if (!isBulkUpdateRequest(body)) {
            return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          const results = [];

          for (const record of body.records) {
            const pcoId = record['Person ID'];
            const personName = `${record['First Name'] || ''} ${record['Last Name'] || ''}`.trim();

            try {
              console.log(`Processing person ${pcoId || 'NEW'} with full record data:`, record);
              const result = await pcoAPI.upsertPersonWithDetails(pcoId, record);
              
              if (result.success) {
                const detailsText = result.details && result.details.length > 0 ? 
                  ` (${result.details.join(', ')})` : '';
                
                results.push({
                  pcoId: result.personId || pcoId || 'NEW',
                  name: personName,
                  status: 'success',
                  message: `${result.action === 'created' ? 'Created' : 'Updated'} successfully${detailsText}`,
                  action: result.action
                });
              } else {
                results.push({
                  pcoId: pcoId || 'N/A',
                  name: personName,
                  status: 'error',
                  message: result.error || 'Operation failed',
                  action: 'failed'
                });
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Operation failed';
              console.error(`Exception in bulk upsert for person ${pcoId}:`, error);
              results.push({
                pcoId: pcoId || 'N/A',
                name: personName,
                status: 'error',
                message: errorMessage,
                action: 'failed'
              });
            }
          }

          // Calculate summary
          const total = results.length;
          const successful = results.filter(r => r.status === 'success').length;
          const errors = results.filter(r => r.status === 'error').length;
          const created = results.filter(r => r.action === 'created' && r.status === 'success').length;
          const updated = results.filter(r => r.action === 'updated' && r.status === 'success').length;

          return new Response(JSON.stringify({ 
            success: true, 
            results,
            summary: {
              total,
              successful,
              errors,
              created,
              updated
            }
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

			default:
          return new Response('Not Found', { 
            status: 404,
            headers: corsHeaders
          });
      }
    } catch (error) {
      console.error('Worker error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Internal server error';
      return new Response(JSON.stringify({ 
        success: false, 
        error: errorMessage
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
		}
	},
} satisfies ExportedHandler<Env>;
