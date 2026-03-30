import type { SidebarNode } from "../types/workspace";

interface FindResult {
  node: SidebarNode;
  parent: SidebarNode[]; // the array containing the node
  index: number; // position within parent array
}

/**
 * Find a node by ID and type in the sidebar tree.
 * Returns the node, its parent array, and index within that array.
 */
export function findSidebarNode(
  tree: SidebarNode[],
  nodeId: string,
  nodeType: "workspace" | "folder",
): FindResult | null {
  for (let i = 0; i < tree.length; i++) {
    const node = tree[i];
    if (!node) continue;
    if (nodeType === "workspace" && node.type === "workspace" && node.workspaceId === nodeId) {
      return { node, parent: tree, index: i };
    }
    if (nodeType === "folder" && node.type === "folder" && node.id === nodeId) {
      return { node, parent: tree, index: i };
    }
    if (node.type === "folder") {
      const found = findSidebarNode(node.children, nodeId, nodeType);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Find a folder by ID. Returns the folder node or null.
 */
export function findFolder(
  tree: SidebarNode[],
  folderId: string,
): (SidebarNode & { type: "folder" }) | null {
  for (const node of tree) {
    if (node.type === "folder" && node.id === folderId) return node;
    if (node.type === "folder") {
      const found = findFolder(node.children, folderId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Remove a node from the tree by ID and type.
 * Returns [newTree, removedNode] or [originalTree, null] if not found.
 */
export function removeSidebarNode(
  tree: SidebarNode[],
  nodeId: string,
  nodeType: "workspace" | "folder",
): [SidebarNode[], SidebarNode | null] {
  const newTree: SidebarNode[] = [];
  let removed: SidebarNode | null = null;

  for (const node of tree) {
    if (removed) {
      newTree.push(node);
      continue;
    }
    if (nodeType === "workspace" && node.type === "workspace" && node.workspaceId === nodeId) {
      removed = node;
      continue;
    }
    if (nodeType === "folder" && node.type === "folder" && node.id === nodeId) {
      removed = node;
      continue;
    }
    if (node.type === "folder") {
      const [newChildren, childRemoved] = removeSidebarNode(node.children, nodeId, nodeType);
      if (childRemoved) {
        removed = childRemoved;
        newTree.push({ ...node, children: newChildren });
        continue;
      }
    }
    newTree.push(node);
  }

  return [removed ? newTree : tree, removed];
}

/**
 * Insert a node at a specific position in the tree.
 * parentId=null means root level. Returns new tree.
 */
export function insertSidebarNode(
  tree: SidebarNode[],
  node: SidebarNode,
  parentId: string | null,
  index: number,
): SidebarNode[] {
  if (parentId === null) {
    const newTree = [...tree];
    newTree.splice(Math.min(index, newTree.length), 0, node);
    return newTree;
  }

  return tree.map((item) => {
    if (item.type === "folder" && item.id === parentId) {
      const newChildren = [...item.children];
      newChildren.splice(Math.min(index, newChildren.length), 0, node);
      return { ...item, children: newChildren };
    }
    if (item.type === "folder") {
      const newChildren = insertSidebarNode(item.children, node, parentId, index);
      if (newChildren !== item.children) {
        return { ...item, children: newChildren };
      }
    }
    return item;
  });
}

/**
 * Check if targetId is a descendant of folderId (cycle prevention).
 */
export function isDescendant(tree: SidebarNode[], folderId: string, targetId: string): boolean {
  const folder = findFolder(tree, folderId);
  if (!folder) return false;

  function check(children: SidebarNode[]): boolean {
    for (const child of children) {
      if (child.type === "folder") {
        if (child.id === targetId) return true;
        if (check(child.children)) return true;
      }
    }
    return false;
  }

  return check(folder.children);
}

/**
 * Update a folder's property in the tree. Returns new tree.
 */
export function updateFolderInTree(
  tree: SidebarNode[],
  folderId: string,
  updates: Partial<{ name: string; collapsed: boolean }>,
): SidebarNode[] {
  return tree.map((node) => {
    if (node.type === "folder" && node.id === folderId) {
      return { ...node, ...updates };
    }
    if (node.type === "folder") {
      const newChildren = updateFolderInTree(node.children, folderId, updates);
      if (newChildren !== node.children) {
        return { ...node, children: newChildren };
      }
    }
    return node;
  });
}

/**
 * Remove a folder but promote its children to the folder's parent position.
 * Returns new tree.
 */
export function removeFolderPromoteChildren(tree: SidebarNode[], folderId: string): SidebarNode[] {
  const newTree: SidebarNode[] = [];
  for (const node of tree) {
    if (node.type === "folder" && node.id === folderId) {
      // Promote children to this level
      newTree.push(...node.children);
    } else if (node.type === "folder") {
      const newChildren = removeFolderPromoteChildren(node.children, folderId);
      newTree.push(newChildren !== node.children ? { ...node, children: newChildren } : node);
    } else {
      newTree.push(node);
    }
  }
  return newTree;
}
