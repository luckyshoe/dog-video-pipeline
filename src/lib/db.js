const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

module.exports = {
  supabase,

  // --- Video CRUD ---
  async insertVideo(data) {
    const { data: row, error } = await supabase
      .from('videos')
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(`DB insert failed: ${error.message}`);
    return row;
  },

  async updateVideo(id, data) {
    const { data: row, error } = await supabase
      .from('videos')
      .update(data)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`DB update failed: ${error.message}`);
    return row;
  },

  async getVideoById(id) {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw new Error(`DB fetch failed: ${error.message}`);
    return data;
  },

  async getOldestByStatus(status) {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    if (error && error.code !== 'PGRST116') throw new Error(`DB query failed: ${error.message}`);
    return data || null;
  },

  async countByStatus(status) {
    const { count, error } = await supabase
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .eq('status', status);
    if (error) throw new Error(`DB count failed: ${error.message}`);
    return count || 0;
  },

  async videoExistsByUrl(sourceUrl) {
    const { count, error } = await supabase
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .eq('source_url', sourceUrl);
    if (error) return false;
    return count > 0;
  },

  async getVideoByTelegramMessageId(messageId) {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('telegram_message_id', String(messageId))
      .single();
    if (error) return null;
    return data;
  },

  // --- Prompt Performance ---
  async logPromptPerformance(data) {
    const { error } = await supabase.from('prompt_performance').insert(data);
    if (error) console.error('[db] prompt_performance insert failed:', error.message);
  },

  async getRecentPerformance(days = 7) {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data, error } = await supabase
      .from('prompt_performance')
      .select('*')
      .gte('created_at', since);
    if (error) throw new Error(`DB performance query failed: ${error.message}`);
    return data || [];
  },

  // --- Learned Patterns ---
  async insertPattern(data) {
    const { error } = await supabase.from('learned_patterns').insert(data);
    if (error) console.error('[db] pattern insert failed:', error.message);
  },

  async getActivePatterns() {
    const { data, error } = await supabase
      .from('learned_patterns')
      .select('*')
      .eq('still_active', true);
    if (error) return [];
    return data || [];
  },

  // --- Stats ---
  async getStatsToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const since = today.toISOString();

    const [generated, approved] = await Promise.all([
      supabase.from('videos').select('*', { count: 'exact', head: true }).gte('generated_at', since),
      supabase.from('videos').select('*', { count: 'exact', head: true }).gte('approved_at', since),
    ]);
    return {
      generated_today: generated.count || 0,
      approved_today: approved.count || 0,
    };
  },

  // --- Stuck video recovery ---
  async getStuckVideos(minutes = 30) {
    const cutoff = new Date(Date.now() - minutes * 60000).toISOString();
    const processingStatuses = ['analyzing', 'generating', 'uploading'];
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .in('status', processingStatuses)
      .lt('updated_at', cutoff);
    if (error) return [];
    return data || [];
  },
};
