import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const STORAGE_LIST_PAGE_SIZE = 1000;

async function listAllFiles(
  client: SupabaseClient,
  bucket: string,
  path: string
): Promise<{ files: { name: string }[]; error: string | null }> {
  const files: { name: string }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(path, { limit: STORAGE_LIST_PAGE_SIZE, offset });

    if (error) {
      return { files, error: error.message };
    }

    if (!data || data.length === 0) {
      break;
    }

    files.push(...data);

    if (data.length < STORAGE_LIST_PAGE_SIZE) {
      break;
    }

    offset += STORAGE_LIST_PAGE_SIZE;
  }

  return { files, error: null };
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  const accessToken = authHeader.replace("Bearer ", "");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const callerClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await callerClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }
  const uid = userData.user.id;

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const errors: string[] = [];

  const { error: messagesError } = await adminClient.from("messages").delete().eq("uid", uid);
  if (messagesError) {
    errors.push(messagesError.message);
  }

  const { files: avatarFiles, error: avatarListError } = await listAllFiles(
    adminClient,
    "avatars",
    uid
  );
  if (avatarListError) {
    errors.push(avatarListError);
  }
  if (avatarFiles.length > 0) {
    const { error: avatarRemoveError } = await adminClient.storage
      .from("avatars")
      .remove(avatarFiles.map((f) => `${uid}/${f.name}`));
    if (avatarRemoveError) {
      errors.push(avatarRemoveError.message);
    }
  }

  const { files: mediaFiles, error: mediaListError } = await listAllFiles(
    adminClient,
    "media",
    uid
  );
  if (mediaListError) {
    errors.push(mediaListError);
  }
  if (mediaFiles.length > 0) {
    const { error: mediaRemoveError } = await adminClient.storage
      .from("media")
      .remove(mediaFiles.map((f) => `${uid}/${f.name}`));
    if (mediaRemoveError) {
      errors.push(mediaRemoveError.message);
    }
  }

  const { error: usersError } = await adminClient.from("users").delete().eq("id", uid);
  if (usersError) {
    errors.push(usersError.message);
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(uid);
  if (deleteError) {
    errors.push(deleteError.message);
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 500 });
  }

  return NextResponse.json({ error: null });
}
