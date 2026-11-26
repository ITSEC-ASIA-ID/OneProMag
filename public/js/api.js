let unauthorizedHandler = null;

export function onUnauthorized(fn) {
  unauthorizedHandler = fn;
}

/**
 * The same call as `request`, but it can say how far along it is.
 *
 * `fetch` cannot report upload progress — it resolves a promise when the whole
 * body is gone — and a 50 MB file over a slow link is exactly the case where a
 * spinner with no number looks like a hang. `XMLHttpRequest` reports
 * `upload.onprogress`, so the one call that carries a file uses it. Everything
 * else stays on `fetch`.
 */
function requestWithProgress(method, url, body, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (onProgress && xhr.upload) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) onProgress(event.loaded, event.total);
      });
    }
    xhr.addEventListener('load', () => {
      let data = null;
      if (xhr.responseText) {
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          data = { error: xhr.responseText };
        }
      }
      if (xhr.status === 401 && unauthorizedHandler) unauthorizedHandler();
      if (xhr.status < 200 || xhr.status >= 300) {
        const err = new Error((data && data.error) || `Request failed (${xhr.status})`);
        err.status = xhr.status;
        reject(err);
        return;
      }
      resolve(data);
    });
    xhr.addEventListener('error', () => reject(new Error('The upload failed — check the connection')));
    xhr.addEventListener('abort', () => reject(new Error('The upload was cancelled')));
    xhr.send(JSON.stringify(body));
  });
}

async function request(method, url, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (res.status === 401 && unauthorizedHandler) unauthorizedHandler();
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  me: () => request('GET', '/api/auth/me'),
  presence: () => request('GET', '/api/presence'),
  updateProfile: (payload) => request('PATCH', '/api/auth/profile', payload),
  login: (username, password) => request('POST', '/api/auth/login', { username, password }),
  register: (payload) => request('POST', '/api/auth/register', payload),
  logout: () => request('POST', '/api/auth/logout'),
  changePassword: (currentPassword, newPassword) =>
    request('POST', '/api/auth/password', { currentPassword, newPassword }),

  users: () => request('GET', '/api/users'),
  directory: () => request('GET', '/api/directory'),
  person: (id) => request('GET', `/api/people/${id}`),
  supervisors: () => request('GET', '/api/supervisors'),
  info: (scope, scopeId, env = 'Dev') =>
    request(
      'GET',
      `/api/info?scope=${encodeURIComponent(scope)}&scopeId=${Number(scopeId)}&env=${encodeURIComponent(env)}`
    ),
  searchInfo: (q) => request('GET', `/api/info/search?q=${encodeURIComponent(q)}`),
  doc: (scope, scopeId, env = 'Dev') =>
    request('GET', `/api/docs/${encodeURIComponent(scope)}/${Number(scopeId)}?env=${encodeURIComponent(env)}`),
  saveDoc: (scope, scopeId, payload, env = 'Dev') =>
    request('PATCH', `/api/docs/${encodeURIComponent(scope)}/${Number(scopeId)}`, {
      env,
      ...payload,
    }),
  createInfo: (payload) => request('POST', '/api/info', payload),
  infoFiles: (scope, scopeId) =>
    request(
      'GET',
      `/api/info-files?scope=${encodeURIComponent(scope)}&scopeId=${Number(scopeId)}`
    ),
  uploadInfoFile: (payload, onProgress) =>
    requestWithProgress('POST', '/api/info-files', payload, onProgress),
  deleteInfoFile: (id) => request('DELETE', `/api/info-files/${Number(id)}`),
  updateInfo: (id, payload) => request('PATCH', `/api/info/${id}`, payload),
  deleteInfo: (id) => request('DELETE', `/api/info/${id}`),
  createSupervisor: (payload) => request('POST', '/api/supervisors', payload),
  updateSupervisor: (id, payload) => request('PATCH', `/api/supervisors/${id}`, payload),
  deleteSupervisor: (id) => request('DELETE', `/api/supervisors/${id}`),
  stats: () => request('GET', '/api/stats'),

  properties: () => request('GET', '/api/properties'),
  createProperty: (kind, payload) => request('POST', `/api/properties/${kind}`, payload),
  updateProperty: (kind, id, payload) => request('PATCH', `/api/properties/${kind}/${id}`, payload),
  deleteProperty: (kind, id) => request('DELETE', `/api/properties/${kind}/${id}`),
  reorderProperties: (kind, ids) => request('PATCH', '/api/properties/order', { kind, ids }),

  pentesters: () => request('GET', '/api/pentesters'),
  createPentester: (payload) => request('POST', '/api/pentesters', payload),
  updatePentester: (id, payload) => request('PATCH', `/api/pentesters/${id}`, payload),
  deletePentester: (id) => request('DELETE', `/api/pentesters/${id}`),

  availability: () => request('GET', '/api/availability'),
  updateAvailability: (id, payload) => request('PATCH', `/api/availability/${id}`, payload),
  assignPentester: (projectId, userId) =>
    request('POST', `/api/projects/${projectId}/pentesters`, { userId }),
  unassignPentester: (projectId, userId) =>
    request('DELETE', `/api/projects/${projectId}/pentesters/${userId}`),

  clients: () => request('GET', '/api/clients'),
  createClient: (payload) => request('POST', '/api/clients', payload),
  updateClient: (id, payload) => request('PATCH', `/api/clients/${id}`, payload),
  deleteClient: (id) => request('DELETE', `/api/clients/${id}`),

  applications: (query = {}) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== '' && v !== undefined && v !== null && v !== false) params.set(k, v);
    }
    const qs = params.toString();
    return request('GET', `/api/applications${qs ? `?${qs}` : ''}`);
  },
  createApplication: (payload) => request('POST', '/api/applications', payload),
  updateApplication: (id, payload) => request('PATCH', `/api/applications/${id}`, payload),
  deleteApplication: (id) => request('DELETE', `/api/applications/${id}`),

  // Variant apps: the optional third level, Client -> Application -> Variant.
  variants: (query = {}) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== '' && v !== undefined && v !== null && v !== false) params.set(k, v);
    }
    const qs = params.toString();
    return request('GET', `/api/variants${qs ? `?${qs}` : ''}`);
  },
  createVariant: (applicationId, payload) =>
    request('POST', `/api/applications/${applicationId}/variants`, payload),
  updateVariant: (id, payload) => request('PATCH', `/api/variants/${id}`, payload),
  deleteVariant: (id) => request('DELETE', `/api/variants/${id}`),

  projects: (query = {}) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== '' && v !== undefined && v !== null && v !== false) params.set(k, v);
    }
    const qs = params.toString();
    return request('GET', `/api/projects${qs ? `?${qs}` : ''}`);
  },
  project: (id) => request('GET', `/api/projects/${id}`),
  createProject: (payload) => request('POST', '/api/projects', payload),
  updateProject: (id, payload) => request('PATCH', `/api/projects/${id}`, payload),
  deleteProject: (id) => request('DELETE', `/api/projects/${id}`),

  createRetest: (projectId, payload) => request('POST', `/api/projects/${projectId}/retests`, payload),
  updateRetest: (id, payload) => request('PATCH', `/api/retests/${id}`, payload),
  deleteRetest: (id) => request('DELETE', `/api/retests/${id}`),

  devices: (query = {}) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== '' && v !== undefined && v !== null && v !== false) params.set(k, v);
    }
    const qs = params.toString();
    return request('GET', `/api/devices${qs ? `?${qs}` : ''}`);
  },
  // The kind sits in the PATH, not the query: it is the resource being edited.
  saveDeviceColumns: (kind, columns) =>
    request('PATCH', `/api/devices/columns/${encodeURIComponent(kind)}`, { columns }),
  reorderDevices: (kind, ids) => request('PATCH', '/api/devices/order', { kind, ids }),
  createDevice: (payload) => request('POST', '/api/devices', payload),
  updateDevice: (id, payload) => request('PATCH', `/api/devices/${id}`, payload),
  bulkUpdateDevices: (updates) => request('PATCH', '/api/devices/bulk', { updates }),
  deleteDevice: (id) => request('DELETE', `/api/devices/${id}`),

  // Attachments. The download is a plain link, not a fetch: the browser has to
  // own the save dialog, and the server answers with Content-Disposition.
  projectFiles: (projectId) => request('GET', `/api/projects/${projectId}/files`),
  uploadFile: (projectId, payload, onProgress) =>
    requestWithProgress('POST', `/api/projects/${projectId}/files`, payload, onProgress),
  deleteFile: (id) => request('DELETE', `/api/project-files/${id}`),

  // Checklists: the catalogue the Admin panel owns.
  checklists: () => request('GET', '/api/checklists'),
  checklist: (id) => request('GET', `/api/checklists/${id}`),
  /** Groups and their counts only — the editor's first paint, without the rows. */
  checklistSummary: (id) => request('GET', `/api/checklists/${Number(id)}?summary=1`),
  /** One item's sub items, which is one group's worth of rows. */
  checklistItems: (id, section) =>
    request('GET', `/api/checklists/${Number(id)}/items?section=${encodeURIComponent(section)}`),
  createChecklist: (payload) => request('POST', '/api/checklists', payload),
  updateChecklist: (id, payload) => request('PATCH', `/api/checklists/${id}`, payload),
  deleteChecklist: (id) => request('DELETE', `/api/checklists/${id}`),
  createChecklistItems: (id, items) => request('POST', `/api/checklists/${id}/items`, { items }),
  updateChecklistItem: (id, payload) => request('PATCH', `/api/checklist-items/${id}`, payload),
  deleteChecklistItem: (id) => request('DELETE', `/api/checklist-items/${id}`),
  // Checklists on an engagement.
  projectChecklists: (projectId) => request('GET', `/api/projects/${projectId}/checklists`),
  attachChecklist: (projectId, checklistId) =>
    request('POST', `/api/projects/${projectId}/checklists`, { checklistId }),
  detachChecklist: (id) => request('DELETE', `/api/project-checklists/${id}`),
  answerChecklistItem: (linkId, itemId, payload) =>
    request('PATCH', `/api/project-checklists/${linkId}/items/${itemId}`, payload),

  // Pentest notes: the working log of an engagement.
  // One working note per project: saving it twice saves it once, so PUT —
  // which is also what makes a retried save safe.
  savePentestNotes: (projectId, body) =>
    request('PUT', `/api/projects/${projectId}/pentest-notes`, { body }),

  // What we found on one engagement. A separate resource from the reference
  // The risk matrix: likelihood × impact → severity. Served so the form and the
  // server cannot band the same pair differently.
  riskMatrix: () => request('GET', '/api/risk-matrix'),

  // library: `findings()` is the method, these are the claims about a project.
  projectFindings: (projectId) => request('GET', `/api/projects/${projectId}/findings`),
  createFinding: (projectId, payload) => request('POST', `/api/projects/${projectId}/findings`, payload),
  updateFinding: (id, payload) => request('PATCH', `/api/findings/${id}`, payload),
  deleteFinding: (id) => request('DELETE', `/api/findings/${id}`),

  // The reference libraries. Read-only, and small enough to hold: the pages
  // filter locally, so a search never waits on the network.
  tests: () => request('GET', '/api/tests'),
  createGuide: (payload) => request('POST', '/api/tests', payload),
  updateGuide: (id, payload) => request('PATCH', `/api/tests/${id}`, payload),
  deleteGuide: (id) => request('DELETE', `/api/tests/${id}`),
  findings: () => request('GET', '/api/findings'),
  // The catalogue, read and written: a category tree every guide can cite, and the
  // cases under it. They are rows an admin owns, so the guide editor's citation
  // list and this page cannot disagree.
  categories: () => request('GET', '/api/categories'),
  createCategory: (payload) => request('POST', '/api/categories', payload),
  updateCategory: (code, payload) => request('PATCH', `/api/categories/${code}`, payload),
  deleteCategory: (code) => request('DELETE', `/api/categories/${code}`),
};
