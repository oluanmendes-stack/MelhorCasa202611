import { supabase, isSupabaseConfigured } from './supabase';
import { Property, PropertySnapshot } from '@/types/property';

export type Invite = { fromId: string; fromUsername: string };

export type Match = { property: PropertySnapshot; withUserId?: string };

export type User = {
  id: string;
  username: string;
  password?: string;
  likedProperties: PropertySnapshot[];
  dislikedProperties: PropertySnapshot[];
  invites: Invite[];
  roommates: string[];
  matches: Match[];
};

let currentUserId: string | null = null;

const LOCAL_USERS_KEY = 'app_users_v2';

// Helper for local storage users
function getLocalUsers(): User[] {
  try {
    const stored = localStorage.getItem(LOCAL_USERS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('Error reading local users', e);
    return [];
  }
}

function saveLocalUsers(users: User[]) {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch (e) {
    console.error('Error saving local users', e);
  }
}

// Initialize current user from session storage
export async function initializeAuth() {
  try {
    const stored = sessionStorage.getItem('app_current_user_id_v2');
    if (stored) {
      currentUserId = stored;
    }
  } catch (e) {
    console.error('initializeAuth error', e);
  }
}

export function setCurrentUserId(id: string | null) {
  if (id) {
    sessionStorage.setItem('app_current_user_id_v2', id);
    currentUserId = id;
  } else {
    sessionStorage.removeItem('app_current_user_id_v2');
    currentUserId = null;
  }
}

export async function getAllUsers(): Promise<User[]> {
  if (!isSupabaseConfigured) {
    // Return local users from localStorage as fallback
    return getLocalUsers();
  }

  const { data: users, error } = await supabase
    .from('users')
    .select('id, username');

  if (error) {
    const errorMsg = error instanceof Error ? error.message : (error?.message || JSON.stringify(error));
    console.error('getAllUsers error:', errorMsg);
    // Return local users as fallback on error
    return getLocalUsers();
  }

  const result: User[] = [];
  for (const user of users || []) {
    try {
      const fullUser = await getUserById(user.id);
      if (fullUser) result.push(fullUser);
    } catch (userError) {
      const userErrorMsg = userError instanceof Error ? userError.message : (typeof userError === 'object' ? JSON.stringify(userError) : String(userError));
      console.error(`Error fetching user ${user.id}:`, userErrorMsg);
    }
  }

  return result;
}

export async function getUserById(id: string): Promise<User | undefined> {
  // Try local storage first if Supabase is not configured
  if (!isSupabaseConfigured) {
    const localUsers = getLocalUsers();
    return localUsers.find(u => u.id === id);
  }

  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('id, username')
    .eq('id', id)
    .single();

  if (userError || !userData) {
    if (userError) {
      const errorMsg = userError instanceof Error ? userError.message : (userError?.message || JSON.stringify(userError));
      console.error('getUserById error:', errorMsg);
    }
    // Fallback to local storage on error
    const localUsers = getLocalUsers();
    return localUsers.find(u => u.id === id);
  }

  // Get all user data in parallel instead of sequential
  const [
    { data: liked },
    { data: disliked },
    { data: invites },
    { data: roommatePairs },
    { data: matches }
  ] = await Promise.all([
    supabase
      .from('liked_properties')
      .select('property_data')
      .eq('user_id', id),
    supabase
      .from('disliked_properties')
      .select('property_data')
      .eq('user_id', id),
    supabase
      .from('invites')
      .select('from_user_id, from_username')
      .eq('to_user_id', id),
    supabase
      .from('roommates')
      .select('user_a_id, user_b_id')
      .or(`user_a_id.eq.${id},user_b_id.eq.${id}`),
    supabase
      .from('matches')
      .select('user_a_id, user_b_id, property_data')
      .or(`user_a_id.eq.${id},user_b_id.eq.${id}`)
  ]);

  const roommates = roommatePairs?.flatMap(pair => {
    if (pair.user_a_id === id) return [pair.user_b_id];
    return [pair.user_a_id];
  }) || [];

  const matchList = matches?.map(m => ({
    property: m.property_data as PropertySnapshot,
    withUserId: m.user_a_id === id ? m.user_b_id : m.user_a_id
  })) || [];

  return {
    id: userData.id,
    username: userData.username,
    likedProperties: liked?.map(item => item.property_data as PropertySnapshot) || [],
    dislikedProperties: disliked?.map(item => item.property_data as PropertySnapshot) || [],
    invites: invites?.map(i => ({ fromId: i.from_user_id, fromUsername: i.from_username })) || [],
    roommates,
    matches: matchList
  };
}

export async function getCurrentUser(): Promise<User | null> {
  if (!currentUserId) return null;
  return await getUserById(currentUserId) || null;
}

export async function registerUser(
  username: string,
  password: string
): Promise<{ success: boolean; message?: string; user?: User }> {
  try {
    if (isSupabaseConfigured) {
      // Check if user already exists in Supabase
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .ilike('username', username)
        .single();

      if (existing) {
        return { success: false, message: 'Usuário já existe' };
      }

      // Create new user in Supabase
      const userId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const { error: insertError } = await supabase
        .from('users')
        .insert([{ id: userId, username, password }]);

      if (insertError) {
        throw insertError;
      }

      const user = await getUserById(userId);
      setCurrentUserId(userId);
      return { success: true, user: user || undefined };
    }
  } catch (e: any) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error('registerUser Supabase error', errorMsg);
    // Fallback to local storage
  }

  // Local storage registration
  const users = getLocalUsers();
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { success: false, message: 'Usuário já existe' };
  }

  const userId = `user-local-${Date.now()}`;
  const newUser: User = {
    id: userId,
    username,
    password,
    likedProperties: [],
    dislikedProperties: [],
    invites: [],
    roommates: [],
    matches: []
  };

  users.push(newUser);
  saveLocalUsers(users);
  setCurrentUserId(userId);

  return { success: true, user: newUser };
}

export async function loginUser(
  username: string,
  password: string
): Promise<{ success: boolean; message?: string; user?: User }> {
  try {
    if (isSupabaseConfigured) {
      const { data: users, error } = await supabase
        .from('users')
        .select('id, password')
        .ilike('username', username);

      if (!error && users && users.length > 0) {
        const user = users[0];
        if (user.password === password) {
          const fullUser = await getUserById(user.id);
          setCurrentUserId(user.id);
          return { success: true, user: fullUser || undefined };
        } else {
          return { success: false, message: 'Senha inválida' };
        }
      }
    }
  } catch (e: any) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error('loginUser Supabase error', errorMsg);
  }

  // Local storage login fallback
  const users = getLocalUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

  if (!user) {
    return { success: false, message: 'Usuário não encontrado' };
  }

  if (user.password !== password) {
    return { success: false, message: 'Senha inválida' };
  }

  setCurrentUserId(user.id);
  return { success: true, user };
}

export function logoutUser() {
  setCurrentUserId(null);
}

export async function addInvite(
  toUserId: string,
  fromUserId: string
): Promise<{ success: boolean; message?: string }> {
  if (!isSupabaseConfigured) {
    return { success: false, message: 'Supabase não está configurado. Configure as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para usar convites.' };
  }

  const fromUser = await getUserById(fromUserId);
  if (!fromUser) return { success: false, message: 'Usuário inválido' };

  const { data: existing } = await supabase
    .from('invites')
    .select('id')
    .eq('to_user_id', toUserId)
    .eq('from_user_id', fromUserId)
    .single();

  if (existing) return { success: false, message: 'Convite já enviado' };

  await supabase.from('invites').insert([{
    to_user_id: toUserId,
    from_user_id: fromUserId,
    from_username: fromUser.username
  }]);

  return { success: true };
}

export async function acceptInvite(
  userId: string,
  fromUserId: string
): Promise<{ success: boolean; message?: string }> {
  if (!isSupabaseConfigured) {
    return { success: false, message: 'Supabase não está configurado. Configure as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para aceitar convites.' };
  }

  await supabase.from('invites').delete().eq('to_user_id', userId).eq('from_user_id', fromUserId);
  await supabase.from('roommates').insert([{
    user_a_id: userId,
    user_b_id: fromUserId
  }]);
  return { success: true };
}

export async function addLikeForUser(
  userId: string,
  property: PropertySnapshot
): Promise<string[]> {
  if (!isSupabaseConfigured) {
    // In local mode, just return empty array (matches not possible without Supabase)
    return [];
  }

  const user = await getUserById(userId);
  if (!user) {
    console.warn('User not found:', userId);
    return [];
  }

  if (user.likedProperties.some(p => propertiesEqual(p, property))) {
    console.log('Property already liked by user');
    return [];
  }

  console.log(`User ${userId} has ${user.roommates.length} roommates:`, user.roommates);

  await supabase.from('liked_properties').insert([{
    user_id: userId,
    property_data: property
  }]);

  await supabase.from('disliked_properties').delete()
    .eq('user_id', userId).filter('property_data->id', 'eq', property.id);

  const createdMatches: string[] = [];

  // If user has no roommates, no matches possible
  if (user.roommates.length === 0) {
    console.log('User has no roommates, no matches possible');
    return createdMatches;
  }

  // Fetch all roommate data in parallel
  const roommateDataPromises = user.roommates.map(rmId => getUserById(rmId));
  const roommateData = await Promise.all(roommateDataPromises);

  // Check which roommates liked the property and create matches
  const matchPromises: Promise<void>[] = [];
  roommateData.forEach((other, idx) => {
    const rmId = user.roommates[idx];
    console.log(`Checking roommate ${rmId}:`, other ? `has ${other.likedProperties.length} liked properties` : 'user not found');

    if (other?.likedProperties.some(p => propertiesEqual(p, property))) {
      console.log(`Match found with ${rmId}!`);
      createdMatches.push(rmId);
      matchPromises.push(addMatchBetweenUsers(userId, rmId, property));
    }
  });

  // Execute all match creations in parallel
  if (matchPromises.length > 0) {
    console.log(`Creating ${matchPromises.length} matches...`);
    await Promise.all(matchPromises);
  } else {
    console.log('No roommates liked this property');
  }

  console.log('Returning createdMatches:', createdMatches);
  return createdMatches;
}

export async function addDislikeForUser(
  userId: string,
  property: PropertySnapshot
): Promise<void> {
  if (!isSupabaseConfigured) {
    // In local mode, dislikes are not persisted
    return;
  }

  const user = await getUserById(userId);
  if (!user || user.dislikedProperties.some(p => propertiesEqual(p, property))) {
    return;
  }

  await supabase.from('disliked_properties').insert([{
    user_id: userId,
    property_data: property
  }]);
  await supabase.from('liked_properties').delete()
    .eq('user_id', userId).filter('property_data->id', 'eq', property.id);
}

export async function addMatchBetweenUsers(
  userAId: string,
  userBId: string,
  property: PropertySnapshot
): Promise<void> {
  if (!isSupabaseConfigured) {
    // In local mode, matches are not persisted
    return;
  }

  console.log(`Creating match between ${userAId} and ${userBId} for property`, property);

  await supabase.from('matches').insert([
    { user_a_id: userAId, user_b_id: userBId, property_data: property },
    { user_a_id: userBId, user_b_id: userAId, property_data: property }
  ]);

  console.log('Match created successfully');
}

export async function getUserLikes(userId: string): Promise<PropertySnapshot[]> {
  const u = await getUserById(userId);
  return u ? u.likedProperties : [];
}

export async function getUserDislikes(userId: string): Promise<PropertySnapshot[]> {
  const u = await getUserById(userId);
  return u ? u.dislikedProperties : [];
}

export async function getUserMatches(userId: string): Promise<Match[]> {
  const u = await getUserById(userId);
  return u ? u.matches : [];
}

export async function removeLikeForUser(
  userId: string,
  property: PropertySnapshot
): Promise<void> {
  if (!isSupabaseConfigured) {
    // In local mode, likes are managed via localStorage
    return;
  }

  // Get liked properties and find matching one by comparing property data
  const { data: allLiked, error: fetchError } = await supabase
    .from('liked_properties')
    .select('id, property_data')
    .eq('user_id', userId);

  if (fetchError) throw fetchError;

  if (allLiked && allLiked.length > 0) {
    for (const item of allLiked) {
      const propData = item.property_data as PropertySnapshot;
      if (propertiesEqual(propData, property)) {
        const { error: deleteError } = await supabase
          .from('liked_properties')
          .delete()
          .eq('id', item.id);
        if (deleteError) throw deleteError;
        break;
      }
    }
  }
}

export async function removeDislikeForUser(
  userId: string,
  property: PropertySnapshot
): Promise<void> {
  if (!isSupabaseConfigured) {
    // In local mode, dislikes are managed via localStorage
    return;
  }

  // Get disliked properties and find matching one by comparing property data
  const { data: allDisliked, error: fetchError } = await supabase
    .from('disliked_properties')
    .select('id, property_data')
    .eq('user_id', userId);

  if (fetchError) throw fetchError;

  if (allDisliked && allDisliked.length > 0) {
    for (const item of allDisliked) {
      const propData = item.property_data as PropertySnapshot;
      if (propertiesEqual(propData, property)) {
        const { error: deleteError } = await supabase
          .from('disliked_properties')
          .delete()
          .eq('id', item.id);
        if (deleteError) throw deleteError;
        break;
      }
    }
  }
}

function normalize(s?: string) {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function propertiesEqual(a: Property, b: Property) {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  if (a.link && b.link && normalize(a.link) === normalize(b.link)) return true;
  const na = normalize(a.nome || '');
  const nb = normalize(b.nome || '');
  const la = normalize(a.localizacao || '');
  const lb = normalize(b.localizacao || '');
  const va = normalize(a.valor || '');
  const vb = normalize(b.valor || '');
  if (na && nb && la && lb) {
    if (na === nb && la === lb) return true;
  }
  if (na && nb && va && vb && na === nb && va === vb) return true;
  return false;
}

// Ranking functions
export async function getRankingOrder(userId: string): Promise<string[]> {
  if (!isSupabaseConfigured) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('property_rankings')
      .select('property_id')
      .eq('user_id', userId)
      .order('ranking_position', { ascending: true });

    if (error) {
      const errorMsg = error instanceof Error ? error.message : (error?.message || JSON.stringify(error));
      console.error('Error fetching ranking order:', errorMsg);
      return [];
    }

    return data?.map(item => item.property_id) || [];
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('Error in getRankingOrder:', errorMsg);
    return [];
  }
}

export async function saveRankingOrder(userId: string, propertyIds: string[]): Promise<void> {
  if (!isSupabaseConfigured) {
    // In local mode, rankings are not persisted
    return;
  }

  try {
    // First, delete existing rankings for this user
    await supabase
      .from('property_rankings')
      .delete()
      .eq('user_id', userId);

    // Then insert new rankings
    const rankings = propertyIds.map((propertyId, index) => ({
      user_id: userId,
      property_id: propertyId,
      ranking_position: index + 1,
    }));

    if (rankings.length > 0) {
      const { error } = await supabase
        .from('property_rankings')
        .insert(rankings);

      if (error) {
        const errorMsg = error instanceof Error ? error.message : (error?.message || JSON.stringify(error));
        console.error('Error saving ranking order:', errorMsg);
        throw error;
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('Error in saveRankingOrder:', errorMsg);
    throw error;
  }
}

export async function getRankingNotes(userId: string): Promise<Record<string, string>> {
  if (!isSupabaseConfigured) {
    return {};
  }

  try {
    const { data, error } = await supabase
      .from('property_rankings')
      .select('property_id, notes')
      .eq('user_id', userId)
      .not('notes', 'is', null);

    if (error) {
      const errorMsg = error instanceof Error ? error.message : (error?.message || JSON.stringify(error));
      console.error('Error fetching ranking notes:', errorMsg);
      return {};
    }

    const notesMap: Record<string, string> = {};
    data?.forEach(item => {
      if (item.notes) {
        notesMap[item.property_id] = item.notes;
      }
    });

    return notesMap;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('Error in getRankingNotes:', errorMsg);
    return {};
  }
}

export async function saveRankingNote(userId: string, propertyId: string, note: string): Promise<void> {
  if (!isSupabaseConfigured) {
    // In local mode, notes are not persisted
    return;
  }

  try {
    // Find existing ranking entry
    const { data: existing, error: fetchError } = await supabase
      .from('property_rankings')
      .select('id')
      .eq('user_id', userId)
      .eq('property_id', propertyId)
      .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    if (existing) {
      // Update existing note
      const { error } = await supabase
        .from('property_rankings')
        .update({ notes: note.trim() || null, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('property_id', propertyId);

      if (error) throw error;
    } else {
      // Create new ranking entry with note
      const { error } = await supabase
        .from('property_rankings')
        .insert([{
          user_id: userId,
          property_id: propertyId,
          ranking_position: 999, // default position
          notes: note.trim() || null,
        }]);

      if (error) throw error;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('Error in saveRankingNote:', errorMsg);
    throw error;
  }
}

// Tags functions
export async function getPropertyTags(userId: string, propertyId: string): Promise<string[]> {
  if (!isSupabaseConfigured) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('property_tags')
      .select('tag')
      .eq('user_id', userId)
      .eq('property_id', propertyId);

    if (error) {
      const errorMsg = error instanceof Error ? error.message : (error?.message || JSON.stringify(error));
      console.error('Error fetching property tags:', errorMsg);
      return [];
    }

    return data?.map(item => item.tag) || [];
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('Error in getPropertyTags:', errorMsg);
    return [];
  }
}

export async function addPropertyTag(userId: string, propertyId: string, tag: string): Promise<void> {
  if (!isSupabaseConfigured) {
    // In local mode, tags are not persisted
    return;
  }

  try {
    const trimmedTag = tag.trim();
    if (!trimmedTag) return;

    // Check if tag already exists
    const { data: existing, error: checkError } = await supabase
      .from('property_tags')
      .select('id')
      .eq('user_id', userId)
      .eq('property_id', propertyId)
      .eq('tag', trimmedTag)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    if (existing) return; // Tag already exists

    const { error } = await supabase
      .from('property_tags')
      .insert([{
        user_id: userId,
        property_id: propertyId,
        tag: trimmedTag,
      }]);

    if (error) throw error;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('Error in addPropertyTag:', errorMsg);
    throw error;
  }
}

export async function removePropertyTag(userId: string, propertyId: string, tag: string): Promise<void> {
  if (!isSupabaseConfigured) {
    // In local mode, tags are not persisted
    return;
  }

  try {
    const { error } = await supabase
      .from('property_tags')
      .delete()
      .eq('user_id', userId)
      .eq('property_id', propertyId)
      .eq('tag', tag);

    if (error) throw error;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('Error in removePropertyTag:', errorMsg);
    throw error;
  }
}

export async function getAllPropertyTags(userId: string): Promise<Record<string, string[]>> {
  if (!isSupabaseConfigured) {
    return {};
  }

  try {
    const { data, error } = await supabase
      .from('property_tags')
      .select('property_id, tag')
      .eq('user_id', userId);

    if (error) {
      const errorMsg = error instanceof Error ? error.message : (error?.message || JSON.stringify(error));
      console.error('Error fetching all property tags:', errorMsg);
      return {};
    }

    const tagsMap: Record<string, string[]> = {};
    data?.forEach(item => {
      if (!tagsMap[item.property_id]) {
        tagsMap[item.property_id] = [];
      }
      tagsMap[item.property_id].push(item.tag);
    });

    return tagsMap;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('Error in getAllPropertyTags:', errorMsg);
    return {};
  }
}

// Ranking preferences functions
export type RankingPreferences = {
  prefTamanhoValue: number | null;
  prefTamanhoPriority: number;
  prefQuartosValue: number | null;
  prefQuartosPriority: number;
  prefBanheirosValue: number | null;
  prefBanheirosPriority: number;
  prefDistanciaValue: number | null;
  prefDistanciaPriority: number;
};

export async function getRankingPreferences(userId: string): Promise<RankingPreferences> {
  if (!isSupabaseConfigured) {
    return {
      prefTamanhoValue: 80,
      prefTamanhoPriority: 1,
      prefQuartosValue: 2,
      prefQuartosPriority: 2,
      prefBanheirosValue: 1,
      prefBanheirosPriority: 3,
      prefDistanciaValue: 10,
      prefDistanciaPriority: 4,
    };
  }

  try {
    const { data, error } = await supabase
      .from('ranking_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      // No preferences found is not an error, return defaults
      console.log('No ranking preferences found for user, using defaults');
      return {
        prefTamanhoValue: 80,
        prefTamanhoPriority: 1,
        prefQuartosValue: 2,
        prefQuartosPriority: 2,
        prefBanheirosValue: 1,
        prefBanheirosPriority: 3,
        prefDistanciaValue: 10,
        prefDistanciaPriority: 4,
      };
    }

    return {
      prefTamanhoValue: data.pref_tamanho_value,
      prefTamanhoPriority: data.pref_tamanho_priority || 1,
      prefQuartosValue: data.pref_quartos_value,
      prefQuartosPriority: data.pref_quartos_priority || 2,
      prefBanheirosValue: data.pref_banheiros_value,
      prefBanheirosPriority: data.pref_banheiros_priority || 3,
      prefDistanciaValue: data.pref_distancia_value,
      prefDistanciaPriority: data.pref_distancia_priority || 4,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('Error in getRankingPreferences:', errorMsg);
    return {
      prefTamanhoValue: 80,
      prefTamanhoPriority: 1,
      prefQuartosValue: 2,
      prefQuartosPriority: 2,
      prefBanheirosValue: 1,
      prefBanheirosPriority: 3,
      prefDistanciaValue: 10,
      prefDistanciaPriority: 4,
    };
  }
}

export async function saveRankingPreferences(userId: string, preferences: RankingPreferences): Promise<void> {
  if (!isSupabaseConfigured) {
    // In local mode, preferences are not persisted
    return;
  }

  try {
    // Try to update first
    const { data: existing, error: fetchError } = await supabase
      .from('ranking_preferences')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (existing) {
      // Update existing preferences
      const { error } = await supabase
        .from('ranking_preferences')
        .update({
          pref_tamanho_value: preferences.prefTamanhoValue,
          pref_tamanho_priority: preferences.prefTamanhoPriority,
          pref_quartos_value: preferences.prefQuartosValue,
          pref_quartos_priority: preferences.prefQuartosPriority,
          pref_banheiros_value: preferences.prefBanheirosValue,
          pref_banheiros_priority: preferences.prefBanheirosPriority,
          pref_distancia_value: preferences.prefDistanciaValue,
          pref_distancia_priority: preferences.prefDistanciaPriority,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) throw error;
    } else {
      // Create new preferences
      const { error } = await supabase
        .from('ranking_preferences')
        .insert([{
          user_id: userId,
          pref_tamanho_value: preferences.prefTamanhoValue,
          pref_tamanho_priority: preferences.prefTamanhoPriority,
          pref_quartos_value: preferences.prefQuartosValue,
          pref_quartos_priority: preferences.prefQuartosPriority,
          pref_banheiros_value: preferences.prefBanheirosValue,
          pref_banheiros_priority: preferences.prefBanheirosPriority,
          pref_distancia_value: preferences.prefDistanciaValue,
          pref_distancia_priority: preferences.prefDistanciaPriority,
        }]);

      if (error) throw error;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('Error in saveRankingPreferences:', errorMsg);
    throw error;
  }
}

// Visits functions
export type Visit = {
  id: string;
  userId: string;
  address: string;
  visitDate: string; // YYYY-MM-DD
  visitTime: string; // HH:mm
  propertyPrice: string;
  notes: string;
  createdAt: string;
  propertyData?: PropertySnapshot; // Property details (photo, link, etc)
};

export async function addVisit(
  userId: string,
  visit: Omit<Visit, 'id' | 'userId' | 'createdAt'>
): Promise<Visit> {
  if (!isSupabaseConfigured) {
    // In local mode, create a local visit object
    const visitId = `visit-${userId}-${Date.now()}`;
    return {
      id: visitId,
      userId: userId,
      address: visit.address,
      visitDate: visit.visitDate,
      visitTime: visit.visitTime,
      propertyPrice: visit.propertyPrice,
      notes: visit.notes,
      propertyData: visit.propertyData,
      createdAt: new Date().toISOString(),
    };
  }

  try {
    const { data, error } = await supabase
      .from('visits')
      .insert([{
        user_id: userId,
        address: visit.address,
        visit_date: visit.visitDate,
        visit_time: visit.visitTime,
        property_price: visit.propertyPrice || '',
        notes: visit.notes || '',
        property_data: visit.propertyData || null,
      }])
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      userId: data.user_id,
      address: data.address,
      visitDate: data.visit_date,
      visitTime: data.visit_time,
      propertyPrice: data.property_price,
      notes: data.notes,
      propertyData: data.property_data as PropertySnapshot | undefined,
      createdAt: data.created_at,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('Error in addVisit:', errorMsg);
    // Fallback to local visit object on error
    const visitId = `visit-${userId}-${Date.now()}`;
    return {
      id: visitId,
      userId: userId,
      address: visit.address,
      visitDate: visit.visitDate,
      visitTime: visit.visitTime,
      propertyPrice: visit.propertyPrice,
      notes: visit.notes,
      propertyData: visit.propertyData,
      createdAt: new Date().toISOString(),
    };
  }
}

export async function getVisits(userId: string): Promise<Visit[]> {
  if (!isSupabaseConfigured) {
    // Return empty array in local mode
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('visits')
      .select('*')
      .eq('user_id', userId)
      .order('visit_date', { ascending: true })
      .order('visit_time', { ascending: true });

    if (error) throw error;

    return (data || []).map(item => ({
      id: item.id,
      userId: item.user_id,
      address: item.address,
      visitDate: item.visit_date,
      visitTime: item.visit_time,
      propertyPrice: item.property_price,
      notes: item.notes,
      propertyData: item.property_data as PropertySnapshot | undefined,
      createdAt: item.created_at,
    }));
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('Error in getVisits:', errorMsg);
    // Return empty array on error instead of throwing
    return [];
  }
}

export async function updateVisit(userId: string, visitId: string, updates: Partial<Omit<Visit, 'id' | 'userId' | 'createdAt'>>): Promise<Visit> {
  if (!isSupabaseConfigured) {
    // In local mode, return a placeholder updated visit
    return {
      id: visitId,
      userId: userId,
      address: updates.address || '',
      visitDate: updates.visitDate || '',
      visitTime: updates.visitTime || '',
      propertyPrice: updates.propertyPrice || '',
      notes: updates.notes || '',
      propertyData: updates.propertyData,
      createdAt: new Date().toISOString(),
    };
  }

  try {
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (updates.address) updateData.address = updates.address;
    if (updates.visitDate) updateData.visit_date = updates.visitDate;
    if (updates.visitTime) updateData.visit_time = updates.visitTime;
    if (updates.propertyPrice !== undefined) updateData.property_price = updates.propertyPrice;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.propertyData !== undefined) updateData.property_data = updates.propertyData;

    const { data, error } = await supabase
      .from('visits')
      .update(updateData)
      .eq('id', visitId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      userId: data.user_id,
      address: data.address,
      visitDate: data.visit_date,
      visitTime: data.visit_time,
      propertyPrice: data.property_price,
      notes: data.notes,
      propertyData: data.property_data as PropertySnapshot | undefined,
      createdAt: data.created_at,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('Error in updateVisit:', errorMsg);
    // Fallback: return the updated visit object on error
    return {
      id: visitId,
      userId: userId,
      address: updates.address || '',
      visitDate: updates.visitDate || '',
      visitTime: updates.visitTime || '',
      propertyPrice: updates.propertyPrice || '',
      notes: updates.notes || '',
      propertyData: updates.propertyData,
      createdAt: new Date().toISOString(),
    };
  }
}

export async function deleteVisit(userId: string, visitId: string): Promise<void> {
  if (!isSupabaseConfigured) {
    // In local mode, visits are not persisted
    return;
  }

  try {
    const { error } = await supabase
      .from('visits')
      .delete()
      .eq('id', visitId)
      .eq('user_id', userId);

    if (error) throw error;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('Error in deleteVisit:', errorMsg);
    // In local mode or on error, just silently succeed
    // The UI will update locally anyway
  }
}
