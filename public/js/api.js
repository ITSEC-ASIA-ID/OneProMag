let unauthorizedHandler = null;

export function onUnauthorized(fn) {
  unauthorizedHandler = fn;
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
  uploadFile: (projectId, payload) => request('POST', `/api/projects/${projectId}/files`, payload),
  deleteFile: (id) => request('DELETE', `/api/project-files/${id}`),

  // Checklists: the catalogue the Admin panel owns.
  checklists: () => request('GET', '/api/checklists'),
  checklist: (id) => request('GET', `/api/checklists/${id}`),
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
  pentestNotes: (projectId) => request('GET', `/api/projects/${projectId}/pentest-notes`),
  addPentestNote: (projectId, payload) =>
    request('POST', `/api/projects/${projectId}/pentest-notes`, payload),
  updatePentestNote: (id, payload) => request('PATCH', `/api/pentest-notes/${id}`, payload),
  deletePentestNote: (id) => request('DELETE', `/api/pentest-notes/${id}`),
};
