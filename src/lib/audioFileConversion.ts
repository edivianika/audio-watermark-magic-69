
/**
 * Utility functions for file conversion
 */

// Convert base64 to file with improved error handling
export const base64ToFile = async (base64String: string, filename: string) => {
  try {
    if (!base64String.includes('base64,')) {
      base64String = `data:audio/mpeg;base64,${base64String}`;
    }
    
    const parts = base64String.split('base64,');
    if (parts.length !== 2) {
      throw new Error('Invalid base64 format');
    }
    
    const mimeString = parts[0].split(':')[1]?.split(';')[0] || 'audio/mpeg';
    
    const byteString = window.atob(parts[1]);
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);
    
    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i);
    }
    
    const blob = new Blob([arrayBuffer], { type: mimeString });
    return new File([blob], filename, { type: mimeString });
  } catch (error) {
    console.error('Error converting base64 to file:', error);
    throw new Error(`Failed to convert base64 to file: ${error.message}`);
  }
};

// Fetch external audio file and convert to File object
export const fetchAudioFile = async (url: string, filename: string): Promise<File> => {
  try {
    console.log(`Fetching audio from URL: ${url}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
    return new File([blob], filename, { type: 'audio/mpeg' });
  } catch (error) {
    console.error('Error fetching audio file:', error);
    throw new Error(`Failed to fetch audio file: ${error.message}`);
  }
};
