// src/components/entrance/EntranceExamDailyMock.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  collection, query, getDocs, doc, getDoc, setDoc, orderBy, limit, serverTimestamp
} from 'firebase/firestore';
import { db } from '../../firebase/config';
