"use client";

import { ImagePlugin } from "@platejs/media/react";
import { KEYS } from "platejs";
import { type AnyPlatePlugin, type PlateEditor, createPlatePlugin } from "platejs/react";

import { ImageElement } from "../plate-ui/image-node";

/**
 * How an image gets from the clipboard onto disk.
 *
 * The package can't know where a host app wants to put bytes, so it takes a
 * callback and stays free of Electron. `NoteEditor` threads the app's
 * implementation through as a plugin option.
 */
export type UploadImage = (file: File) => Promise<string>;

export const ImageUploadPlugin = createPlatePlugin({
  key: "image-upload",
  options: { uploadImage: null as UploadImage | null },
}).extend(({ editor, getOptions }) => ({
  handlers: {
    onDrop: (event) => {
      const files = imageFilesFrom(event.event.dataTransfer);
      if (files.length === 0) return false;

      event.event.preventDefault();
      void insertImages(editor, files, getOptions().uploadImage);
      return true;
    },
    onPaste: (event) => {
      const files = imageFilesFrom(event.event.clipboardData);
      if (files.length === 0) return false;

      event.event.preventDefault();
      void insertImages(editor, files, getOptions().uploadImage);
      return true;
    },
  },
}));

function imageFilesFrom(transfer: DataTransfer | null): File[] {
  if (!transfer) return [];
  return Array.from(transfer.files).filter((file) => file.type.startsWith("image/"));
}

async function insertImages(
  editor: PlateEditor,
  files: File[],
  uploadImage: UploadImage | null,
): Promise<void> {
  if (!uploadImage) {
    console.warn("[note-editor] Dropped an image but no uploadImage handler is configured.");
    return;
  }

  for (const file of files) {
    try {
      const url = await uploadImage(file);
      editor.tf.insertNodes({
        children: [{ text: "" }],
        name: file.name,
        type: KEYS.img,
        url,
      });
    } catch (error) {
      console.error("[note-editor] Failed to store pasted image:", error);
    }
  }
}

// Annotated rather than inferred: the inferred type reaches into a private
// @platejs/media module, which a composite build cannot name.
export const MediaKit: AnyPlatePlugin[] = [
  ImagePlugin.withComponent(ImageElement),
  ImageUploadPlugin as unknown as AnyPlatePlugin,
];
