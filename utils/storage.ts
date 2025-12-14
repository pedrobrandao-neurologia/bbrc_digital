import { Patient, BBRCScores } from '../types';

const STORAGE_KEY = 'BBRC_PATIENTS';

export const getPatients = (): Patient[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

export const savePatient = (patient: Patient): void => {
  const patients = getPatients();
  const existingIndex = patients.findIndex(p => p.id === patient.id);
  
  if (existingIndex >= 0) {
    patients[existingIndex] = patient;
  } else {
    patients.push(patient);
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
};

export const getPatientById = (id: string): Patient | undefined => {
  const patients = getPatients();
  return patients.find(p => p.id === id);
};

export const addTestResult = (patientId: string, results: BBRCScores): void => {
  const patient = getPatientById(patientId);
  if (patient) {
    // Add new result to history
    patient.history = [...(patient.history || []), results];
    savePatient(patient);
  }
};

export const createPatient = (name: string, age: number, education: any): Patient => {
  const newPatient: Patient = {
    id: crypto.randomUUID(),
    name,
    age,
    education,
    history: []
  };
  savePatient(newPatient);
  return newPatient;
};