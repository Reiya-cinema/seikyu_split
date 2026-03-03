import axios from 'axios';

const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:8000' : ''; 

const api = axios.create({
  baseURL: API_BASE_URL,
});

export const scanPDF = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/api/scan', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const executeSplit = async (file, metadata) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('metadata', JSON.stringify(metadata));
  const response = await api.post('/api/execute', formData, {
    responseType: 'blob', // Important for downloading files
    headers: {
        'Content-Type': 'multipart/form-data',
    }
  });
  return response.data;
};

export const getSettings = async () => {
    const response = await api.get('/api/settings');
    return response.data;
}

export const createSetting = async (setting) => {
    const response = await api.post('/api/settings', setting);
    return response.data;
}
