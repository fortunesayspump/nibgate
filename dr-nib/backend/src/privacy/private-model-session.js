const HEX64=/^[0-9a-f]{64}$/;
/** The reviewed GLM provider commits its model-local name into TDX report_data.
 * This exact translation is not a generic alias or router-only acceptance. */
export function privateModelSessionMatches(session,model){
 const extra=session?.claims?.extra;
 if(extra?.canonical_model_id===model)return true;
 if(model!=='z-ai/glm-5.3-flash'||extra?.canonical_model_id!=='GLM-5.3-Flash')return false;
 return session.verifier_id==='private-ai-verifier/armet-ai/v1'&&
  extra.accepted_subject==='tdx-measurement:sha256:f43c310e47b36bf4ae30cd55c5b3d05f807a7a5658e057f6ae18b0c12e9f30a5'&&
  extra.trust_boundary==='armet-ai-td'&&extra.evidence_scope==='model_instance'&&
  extra.model_id_from_report_data===true&&extra.report_data_nonce_matched===true&&
  extra.tls_spki_from_report_data===true&&extra.gpu_evidence_from_report_data===true&&
  extra.gpu_verified===true&&extra.tcb_status==='UpToDate'&&extra.tdx_debug_mode===false&&
  ['tee_attested','gpu_attested','serving_software_known_good','tcb_up_to_date'].every(key=>session.claims[key]?.status==='asserted')&&
  /^sha256:[0-9a-f]{64}$/.test(session.evidence?.digest??'')&&
  session.endpoint==='https://ctf.armet.ai'&&session.channel_binding?.some(binding=>binding.type==='tls_spki_sha256'&&binding.origin===session.endpoint&&HEX64.test(binding.spki_sha256??''));
}
