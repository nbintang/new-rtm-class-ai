export const SYSTEM_PROMPT = `
Anda adalah pakar pendidikan Indonesia.
Tugas Anda adalah membantu guru menghasilkan konten belajar yang rapi, relevan, dan mudah dipahami.

Aturan umum:
1. Selalu gunakan Bahasa Indonesia formal.
2. Jawaban harus relevan dengan materi yang diberikan.
3. Keluaran akhir WAJIB berupa JSON yang valid.
4. Jangan menambahkan markdown, catatan, atau teks di luar struktur JSON yang diminta.
5. Jika materi terbatas, buat keluaran yang tetap aman dan umum, tetapi jangan mengarang fakta spesifik yang tidak didukung materi.
`;

export const GENERATION_PROMPT = `
Konteks materi:
{text}

Tipe output: {type}

Instruksi tugas:
{taskInstructions}

Aturan format:
1. Ikuti nama field persis seperti yang diminta.
2. Keluaran akhir harus berupa objek JSON valid, bukan markdown atau kalimat penjelasan.
3. Untuk MCQ, setiap soal harus memiliki tepat 4 opsi.
4. Untuk MCQ, field "answer" harus salah satu dari: A, B, C, D.
5. Untuk ESSAY, field "rubric" harus singkat, jelas, dan bisa dipakai guru untuk penilaian.
6. Untuk SUMMARY, ringkasan harus padat dan langsung ke inti materi.
`;

export const MCQ_TASK_INSTRUCTIONS = `
Buat {count} soal pilihan ganda berdasarkan materi.
Gunakan struktur: { "questions": [{ "id": "q1", "text": "...", "options": ["...", "...", "...", "..."], "answer": "A" }] }.
Setiap soal harus memiliki satu jawaban benar yang jelas.
Opsi jawaban harus singkat, tidak duplikat, dan tidak semuanya benar.
Jangan hasilkan field lain di level atas selain "questions".
`.trim();

export const ESSAY_TASK_INSTRUCTIONS = `
Buat {count} soal essay berdasarkan materi.
Gunakan struktur: { "questions": [{ "id": "q1", "text": "...", "rubric": "..." }] }.
Rubrik harus ringkas dan langsung bisa dipakai guru untuk menilai jawaban.
Jangan hasilkan field lain di level atas selain "questions".
`.trim();

export const SUMMARY_TASK_INSTRUCTIONS = `
Buat ringkasan materi maksimal {maxWords} kata.
Gunakan struktur: { "summary": "..." }.
Fokus pada inti konsep, tujuan, dan poin penting materi.
Jangan hasilkan field lain di level atas selain "summary".
`.trim();

export const REPAIR_PROMPT_TEMPLATE = `
Perbaiki JSON berikut agar valid untuk output {type}.
Jawaban WAJIB berupa JSON valid saja.
Kesalahan validasi sebelumnya: {validationError}.
JSON sebelumnya: {rawText}.
Struktur yang wajib dipenuhi: {schemaInstruction}.
Jangan tambahkan field lain di level atas.
`.trim();

export const MCQ_SCHEMA_INSTRUCTION = `{countInstruction}{ "questions": [{ "id": "q1", "text": "pertanyaan", "options": ["opsi A", "opsi B", "opsi C", "opsi D"], "answer": "A" }] }`;
export const ESSAY_SCHEMA_INSTRUCTION = `{countInstruction}{ "questions": [{ "id": "q1", "text": "pertanyaan", "rubric": "pedoman penilaian" }] }`;
export const SUMMARY_SCHEMA_INSTRUCTION = `{ "summary": "ringkasan materi" }`;
