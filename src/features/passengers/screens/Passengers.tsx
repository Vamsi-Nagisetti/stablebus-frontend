import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { passengersApi, SavedPassenger, PassengerPayload } from '@/features/passengers/api';

const C={bg:'#F8F4ED',paper:'#FFFEFC',ink:'#382B28',muted:'#887A73',border:'#EAE0D7',burgundy:'#783D4A',light:'#F4EAEB',white:'#fff'};
const emptyForm={title:'Mr' as PassengerPayload['title'],name:'',date_of_birth:'',age:'',gender:'Male'};
export default function PassengersScreen(){
 const router=useRouter(), insets=useSafeAreaInsets();
 const [items,setItems]=useState<SavedPassenger[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [modal,setModal]=useState(false),[editing,setEditing]=useState<SavedPassenger|null>(null),[form,setForm]=useState({...emptyForm});
 const load=useCallback(async()=>{try{setLoading(true);setError('');const data=await passengersApi.list();setItems(Array.isArray(data)?data:[]);}catch(e:any){setError(e.message||'Unable to load passengers.');}finally{setLoading(false);}},[]);
 useEffect(()=>{load();},[load]);
 const open=(p?:SavedPassenger)=>{setEditing(p||null);setForm(p?{title:p.title||'Mr',name:p.name,date_of_birth:p.date_of_birth||'',age:String(p.age),gender:p.gender}: {...emptyForm});setModal(true);};
 const set=(key:string,value:string)=>setForm(prev=>({...prev,[key]:value}));
 const save=async()=>{const age=Number(form.age);if(!form.name.trim()||!Number.isInteger(age)||age<1||age>120){Alert.alert('Check passenger details','Enter a name and a valid age.');return;}if(form.date_of_birth.trim()&&!/^\d{2}\/\d{2}\/\d{4}$/.test(form.date_of_birth.trim())){Alert.alert('Date format','Enter date of birth as DD/MM/YYYY.');return;}
 const payload:PassengerPayload={title:form.title,name:form.name.trim(),date_of_birth:form.date_of_birth.trim()||null,age,gender:form.gender};
 try{setBusy(true);if(editing)await passengersApi.update(editing.passenger_id,payload);else await passengersApi.create(payload);setModal(false);await load();}catch(e:any){Alert.alert('Unable to save',e.message||'Please try again.');}finally{setBusy(false);}};
 const remove=(p:SavedPassenger)=>Alert.alert('Delete passenger',`Remove ${p.name} from your saved passengers?`,[{text:'Keep',style:'cancel'},{text:'Delete',style:'destructive',onPress:async()=>{try{await passengersApi.remove(p.passenger_id);await load();}catch(e:any){Alert.alert('Unable to delete',e.message||'Please try again.');}}}]);
 return <View style={[s.root,{paddingTop:insets.top}]}>
  <View style={s.header}><Pressable style={s.icon} onPress={()=>router.back()}><Ionicons name="arrow-back" size={20} color={C.ink}/></Pressable><View style={{flex:1}}><Text style={s.title}>Saved passengers</Text><Text style={s.sub}>Manage details for quicker bookings</Text></View><Pressable style={s.icon} onPress={()=>open()}><Ionicons name="add" size={23} color={C.burgundy}/></Pressable></View>
  {loading?<View style={s.center}><ActivityIndicator color={C.burgundy}/><Text style={s.muted}>Loading passengers…</Text></View>:error?<View style={s.center}><Text style={s.error}>{error}</Text><Pressable onPress={load}><Text style={s.link}>Try again</Text></Pressable></View>:<ScrollView contentContainerStyle={{padding:18,paddingBottom:insets.bottom+30}}>
   {items.length===0?<View style={s.empty}><View style={s.gift}><Ionicons name="people-outline" size={27} color={C.burgundy}/></View><Text style={s.emptyTitle}>No saved passengers</Text><Text style={s.muted}>Add passenger details to make your next booking quicker.</Text><Pressable style={s.primary} onPress={()=>open()}><Text style={s.primaryText}>Add passenger</Text></Pressable></View>:items.map(p=><View key={p.passenger_id} style={s.card}><View style={s.avatar}><Ionicons name="person-outline" size={19} color={C.burgundy}/></View><View style={{flex:1}}><Text style={s.name}>{p.title?`${p.title} `:''}{p.name}</Text><Text style={s.muted}>{p.age} years · {p.gender}{p.date_of_birth?` · DOB ${p.date_of_birth}`:''}</Text></View><Pressable style={s.action} onPress={()=>open(p)}><Ionicons name="create-outline" size={19} color={C.burgundy}/></Pressable><Pressable style={s.action} onPress={()=>remove(p)}><Ionicons name="trash-outline" size={19} color={C.muted}/></Pressable></View>)}
  </ScrollView>}
  <Modal visible={modal} transparent animationType="slide" onRequestClose={()=>setModal(false)}><View style={s.overlay}><View style={[s.sheet,{paddingBottom:insets.bottom+18}]}><View style={s.modalHead}><Text style={s.modalTitle}>{editing?'Edit passenger':'Add passenger'}</Text><Pressable onPress={()=>setModal(false)}><Ionicons name="close" size={22} color={C.ink}/></Pressable></View>
   <ScrollView keyboardShouldPersistTaps="handled">
    <Text style={s.label}>Title</Text><View style={s.pills}>{(['Mr','Ms','Mrs','Master'] as const).map(v=><Pressable key={v} onPress={()=>set('title',v)} style={[s.pill,form.title===v&&s.pillOn]}><Text style={[s.pillText,form.title===v&&s.pillTextOn]}>{v}</Text></Pressable>)}</View>
    <Text style={s.label}>Full name</Text><TextInput value={form.name} onChangeText={v=>set('name',v)} placeholder="Passenger name" placeholderTextColor={C.muted} style={s.input}/>
    <Text style={s.label}>Age</Text><TextInput value={form.age} onChangeText={v=>set('age',v.replace(/[^0-9]/g,''))} keyboardType="number-pad" placeholder="Age" placeholderTextColor={C.muted} style={s.input}/>
    <Text style={s.label}>Gender</Text><View style={s.pills}>{(['Male','Female','Other'] as const).map(v=><Pressable key={v} onPress={()=>set('gender',v)} style={[s.pill,form.gender===v&&s.pillOn]}><Text style={[s.pillText,form.gender===v&&s.pillTextOn]}>{v}</Text></Pressable>)}</View>
    <Text style={s.label}>Date of birth (optional)</Text><TextInput value={form.date_of_birth} onChangeText={v=>set('date_of_birth',v)} placeholder="DD/MM/YYYY" placeholderTextColor={C.muted} style={s.input}/>
    <Pressable disabled={busy} onPress={save} style={[s.primary,{marginTop:20}]}>{busy?<ActivityIndicator color={C.white}/>:<Text style={s.primaryText}>{editing?'Save changes':'Save passenger'}</Text>}</Pressable>
   </ScrollView></View></View></Modal>
 </View>;
}


const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    padding: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: C.ink,
  },
  sub: {
    fontSize: 11,
    color: C.muted,
    marginTop: 3,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  muted: {
    fontSize: 11,
    color: C.muted,
    marginTop: 5,
  },
  error: {
    color: '#A34444',
    textAlign: 'center',
  },
  link: {
    color: C.burgundy,
    marginTop: 12,
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 65,
  },
  gift: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: C.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.ink,
    marginTop: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 13,
    marginBottom: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
  },
  action: {
    padding: 7,
  },
  primary: {
    backgroundColor: C.burgundy,
    minHeight: 46,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 20,
  },
  primaryText: {
    color: C.white,
    fontSize: 12,
    fontWeight: '700',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(40,30,28,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '90%',
    backgroundColor: C.paper,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
  },
  modalHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.ink,
  },
  label: {
    fontSize: 11,
    color: C.muted,
    fontWeight: '600',
    marginTop: 13,
    marginBottom: 6,
  },
  input: {
    height: 45,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: C.ink,
    backgroundColor: '#FCF9F5',
  },
  pills: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
  },
  pillOn: {
    backgroundColor: C.light,
    borderColor: '#DCC2C5',
  },
  pillText: {
    fontSize: 11,
    color: C.muted,
  },
  pillTextOn: {
    color: C.burgundy,
    fontWeight: '700',
  },
});
