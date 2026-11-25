'use client';

import { doc, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { StudentActivitiesWorkspace } from '@/components/StudentActivitiesWorkspace';
import { useFirebaseAuth } from '@/lib/auth-context';
import { getFirebase } from '@/lib/firebase';
import type { UserProfile } from '@/lib/models';

export default function StudentActivitiesPage() {
  const router = useRouter();
  const { user, loading } = useFirebaseAuth();
  const { db } = getFirebase();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      if (snapshot.exists()) setProfile(snapshot.data() as UserProfile);
    });
  }, [db, user]);

  useEffect(() => {
    if (profile && profile.profileType !== 'student') router.replace('/dashboard');
  }, [profile, router]);

  if (loading || !user || !profile) return <main className="auth-loading">Carregando suas atividades…</main>;
  if (profile.profileType !== 'student') return null;

  return <StudentActivitiesWorkspace grade={profile.grade} studentId={user.uid} />;
}
