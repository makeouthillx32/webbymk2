import React, { useState } from "react";
import { Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VariantInput, SizeOption, ColorOption } from "../types";

// Dynamic option group definition
interface OptionGroup {
  id: string;
  name: string; // "Style", "Finish", "Charm", etc.
  type: "size" | "color" | "custom";
  options: Array<{
    id: string;
    value: string;
    hex?: string; // Only for color type
    weight?: string; // Only for size type
  }>;
}

interface VariantSectionProps {
  variants: VariantInput[];
  baseSku: string;
  availableSizes: SizeOption[];
  availableColors: ColorOption[];
  customGroups: OptionGroup[];
  actions: {
    addSize: () => void;
    updateSize: (id: string, value: string) => void;
    removeSize: (id: string) => void;
    addColor: () => void;
    updateColor: (id: string, field: "name" | "hex", value: string) => void;
    removeColor: (id: string) => void;
    addVariant: () => void;
    updateVariant: (id: string, field: keyof VariantInput, value: any) => void;
    removeVariant: (id: string) => void;
    setVariants?: (variants: VariantInput[]) => void;
    setCustomGroups: (groups: OptionGroup[]) => void;
  };
}

export function VariantSection({
  variants,
  baseSku,
  availableSizes,
  availableColors,
  customGroups,
  actions,
}: VariantSectionProps) {
  const [localWeights, setLocalWeights] = useState<Record<string, string>>({});
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const generateId = () => Math.random().toString(36).substring(7);

  // Toggle section collapse
  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  // Add custom option group
  const addCustomOptionGroup = () => {
    const name = prompt("Group Name (e.g., Style, Finish, Charm):");
    if (!name || !name.trim()) return;

    const newGroup: OptionGroup = {
      id: generateId(),
      name: name.trim(),
      type: "custom",
      options: []
    };

    actions.setCustomGroups([...customGroups, newGroup]);
  };

  // Remove custom option group
  const removeCustomGroup = (groupId: string) => {
    if (!confirm("Remove this option group and all its values?")) return;
    actions.setCustomGroups(customGroups.filter(g => g.id !== groupId));
    
    // Also clear selections from variants
    if (actions.setVariants) {
      const updated = variants.map(v => ({
        ...v,
        customOptions: Object.fromEntries(
          Object.entries(v.customOptions).filter(([key]) => !key.startsWith(`group_${groupId}_`))
        )
      }));
      actions.setVariants(updated);
    }
  };

  // Add option to custom group (inline like Sizes & Weights)
  const addOptionToGroup = (groupId: string) => {
    actions.setCustomGroups(customGroups.map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          options: [...g.options, { id: generateId(), value: "" }]
        };
      }
      return g;
    }));
  };

  // Update option in custom group
  const updateGroupOption = (groupId: string, optionId: string, value: string) => {
    actions.setCustomGroups(customGroups.map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          options: g.options.map(opt => 
            opt.id === optionId ? { ...opt, value } : opt
          )
        };
      }
      return g;
    }));
  };

  // Remove option from custom group
  const removeGroupOption = (groupId: string, optionId: string) => {
    actions.setCustomGroups(customGroups.map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          options: g.options.filter(opt => opt.id !== optionId)
        };
      }
      return g;
    }));

    // Clear from variant selections
    if (actions.setVariants) {
      const updated = variants.map(v => ({
        ...v,
        customOptions: Object.fromEntries(
          Object.entries(v.customOptions).filter(([key]) => key !== `group_${groupId}_selection`)
        )
      }));
      actions.setVariants(updated);
    }
  };

  // Toggle option selection in variant for custom groups
  const toggleCustomSelection = (variantId: string, groupId: string, optionId: string) => {
    const variant = variants.find(v => v.id === variantId);
    if (!variant) return;

    const selectionKey = `group_${groupId}_selection`;
    const currentSelections = (variant.customOptions[selectionKey] as string[]) || [];
    
    const updated = currentSelections.includes(optionId)
      ? currentSelections.filter(id => id !== optionId)
      : [...currentSelections, optionId];

    const newCustomOptions = {
      ...variant.customOptions,
      [selectionKey]: updated
    };

    actions.updateVariant(variantId, "customOptions", newCustomOptions);
  };

  const handleAddCustomVariant = () => {
    if (!actions.setVariants) {
      actions.addVariant();
      return;
    }

    const newVariant: VariantInput = {
      id: generateId(),
      title: "",
      sku: "",
      selectedSizes: [],
      selectedColors: [],
      selectedMaterials: [],
      selectedMadeIn: [],
      customOptions: {},
      weight_grams: "",
      price_override: "",
      initial_stock: "",
    };
    
    actions.setVariants([...variants, newVariant]);
  };

  // ✅ Generate variants from ALL option groups
  const generateVariantsFromAllOptions = () => {
    if (!actions.setVariants) return;

    // Collect all active option groups
    const allGroups: Array<{ id: string; name: string; options: any[] }> = [];

    // Size group
    const filledSizes = availableSizes.filter(s => s.value.trim());
    if (filledSizes.length > 0) {
      allGroups.push({
        id: 'size',
        name: 'Size',
        options: filledSizes.map(s => ({ id: s.id, value: s.value, weight: localWeights[s.id] }))
      });
    }

    // Color group
    const filledColors = availableColors.filter(c => c.name.trim());
    if (filledColors.length > 0) {
      allGroups.push({
        id: 'color',
        name: 'Color',
        options: filledColors.map(c => ({ id: c.id, value: c.name, hex: c.hex }))
      });
    }

    // Custom groups
    customGroups.forEach(group => {
      if (group.options.length > 0) {
        allGroups.push({
          id: group.id,
          name: group.name,
          options: group.options
        });
      }
    });

    if (allGroups.length === 0) {
      alert("Please add at least one option (size, color, or custom) before generating variants");
      return;
    }

    // Generate cartesian product
    const generateCombinations = (groups: typeof allGroups): any[][] => {
      if (groups.length === 0) return [[]];
      if (groups.length === 1) return groups[0].options.map(opt => [{ group: groups[0], option: opt }]);
      
      const [first, ...rest] = groups;
      const restCombos = generateCombinations(rest);
      const result: any[][] = [];
      
      first.options.forEach(opt => {
        restCombos.forEach(combo => {
          result.push([{ group: first, option: opt }, ...combo]);
        });
      });
      
      return result;
    };

    const combinations = generateCombinations(allGroups);
    const generatedVariants: VariantInput[] = [];

    combinations.forEach(combo => {
      const titleParts: string[] = [];
      const selectedSizes: string[] = [];
      const selectedColors: string[] = [];
      const customOptions: Record<string, any> = {};
      let weight = "";

      combo.forEach(({ group, option }) => {
        titleParts.push(option.value);

        if (group.id === 'size') {
          selectedSizes.push(option.id);
          if (option.weight) weight = option.weight;
        } else if (group.id === 'color') {
          selectedColors.push(option.id);
        } else {
          // Custom group
          const selectionKey = `group_${group.id}_selection`;
          customOptions[selectionKey] = [option.id];
        }
      });

      generatedVariants.push({
        id: generateId(),
        title: titleParts.join(" / "),
        sku: "",
        selectedSizes,
        selectedColors,
        selectedMaterials: [],
        selectedMadeIn: [],
        customOptions,
        weight_grams: weight,
        price_override: "",
        initial_stock: "",
      });
    });

    actions.setVariants(generatedVariants);
  };

  // Render option group section
  const renderOptionGroup = (
    id: string,
    title: string,
    isCollapsed: boolean,
    onAdd: () => void,
    onRemove?: () => void,
    children: React.ReactNode
  ) => (
    <div className="border border-[hsl(var(--border))] rounded-lg overflow-hidden">
      <div 
        className="flex items-center justify-between p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => toggleSection(id)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{title}</span>
          {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </div>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          <Button type="button" size="sm" variant="outline" onClick={onAdd}>
            <Plus size={14} />
          </Button>
          {onRemove && (
            <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
              <X size={14} />
            </Button>
          )}
        </div>
      </div>
      {!isCollapsed && (
        <div className="p-3 space-y-2">
          {children}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Option Groups Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sizes & Weights */}
        {renderOptionGroup(
          "sizes",
          "Sizes & Weights",
          collapsedSections.has("sizes"),
          actions.addSize,
          undefined,
          availableSizes.length > 0 ? (
            availableSizes.map((s) => (
              <div key={s.id} className="flex gap-2">
                <Input 
                  value={s.value} 
                  onChange={(e) => actions.updateSize(s.id, e.target.value)} 
                  placeholder="Size" 
                  className="flex-[2]"
                />
                <Input 
                  value={localWeights[s.id] || ""} 
                  onChange={(e) => setLocalWeights(prev => ({ ...prev, [s.id]: e.target.value }))} 
                  placeholder="Weight" 
                  className="flex-1"
                />
                <Button type="button" size="sm" variant="ghost" onClick={() => actions.removeSize(s.id)}>
                  <X size={14} />
                </Button>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground italic">No sizes added yet</p>
          )
        )}

        {/* Colors */}
        {renderOptionGroup(
          "colors",
          "Colors",
          collapsedSections.has("colors"),
          actions.addColor,
          undefined,
          availableColors.length > 0 ? (
            availableColors.map((c) => (
              <div key={c.id} className="flex gap-2">
                <Input 
                  value={c.name} 
                  onChange={(e) => actions.updateColor(c.id, "name", e.target.value)} 
                  placeholder="Color name" 
                  className="flex-1"
                />
                <input 
                  type="color" 
                  value={c.hex} 
                  onChange={(e) => actions.updateColor(c.id, "hex", e.target.value)} 
                  className="w-12 h-10 rounded border border-[hsl(var(--border))]"
                />
                <Button type="button" size="sm" variant="ghost" onClick={() => actions.removeColor(c.id)}>
                  <X size={14} />
                </Button>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground italic">No colors added yet</p>
          )
        )}

        {/* Custom Option Groups */}
        {customGroups.map(group => renderOptionGroup(
          group.id,
          group.name,
          collapsedSections.has(group.id),
          () => addOptionToGroup(group.id),
          () => removeCustomGroup(group.id),
          group.options.length > 0 ? (
            group.options.map(opt => (
              <div key={opt.id} className="flex gap-2">
                <Input 
                  value={opt.value} 
                  onChange={(e) => updateGroupOption(group.id, opt.id, e.target.value)} 
                  placeholder={`${group.name} value`} 
                  className="flex-1"
                />
                <Button 
                  type="button" 
                  size="sm" 
                  variant="ghost" 
                  onClick={() => removeGroupOption(group.id, opt.id)}
                >
                  <X size={14} />
                </Button>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground italic">No {group.name.toLowerCase()} options added yet</p>
          )
        ))}
      </div>

      {/* Add Custom Option Group Button */}
      <Button 
        type="button" 
        onClick={addCustomOptionGroup} 
        variant="outline"
        className="w-full"
      >
        <Plus size={14} className="mr-2" />
        Add Custom Option Group
      </Button>

      {/* Generate/Add Buttons */}
      <div className="flex gap-2">
        <Button 
          type="button" 
          onClick={generateVariantsFromAllOptions} 
          variant="outline"
          className="flex-1"
        >
          🔄 Generate Variants (All Selected Options)
        </Button>
        <Button 
          type="button" 
          onClick={handleAddCustomVariant} 
          variant="outline"
        >
          + Add Custom Variant
        </Button>
      </div>

      {/* Generated Variants */}
      {variants.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-semibold">Variants ({variants.length})</div>
          {variants.map((v, idx) => (
            <div key={v.id} className="border-2 border-[hsl(var(--border))] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Variant {idx + 1}: {v.title}</h4>
                <Button type="button" variant="ghost" size="sm" onClick={() => actions.removeVariant(v.id)}>
                  <X size={16} />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input 
                  value={v.title} 
                  onChange={(e) => actions.updateVariant(v.id, "title", e.target.value)} 
                  placeholder="Title" 
                  className="md:col-span-2"
                />
                
                {/* Show selected options */}
                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-semibold">Selected Options</label>
                  <div className="flex flex-wrap gap-2">
                    {/* Sizes */}
                    {v.selectedSizes.map(sizeId => {
                      const size = availableSizes.find(s => s.id === sizeId);
                      return size ? (
                        <span key={sizeId} className="px-2 py-1 bg-primary text-primary-foreground rounded text-xs">
                          {size.value}
                        </span>
                      ) : null;
                    })}
                    {/* Colors */}
                    {v.selectedColors.map(colorId => {
                      const color = availableColors.find(c => c.id === colorId);
                      return color ? (
                        <span key={colorId} className="px-2 py-1 bg-primary text-primary-foreground rounded text-xs">
                          {color.name}
                        </span>
                      ) : null;
                    })}
                    {/* Custom groups */}
                    {customGroups.map(group => {
                      const selectionKey = `group_${group.id}_selection`;
                      const selections = (v.customOptions[selectionKey] as string[]) || [];
                      return selections.map(optId => {
                        const opt = group.options.find(o => o.id === optId);
                        return opt ? (
                          <span key={`${group.id}-${optId}`} className="px-2 py-1 bg-secondary text-secondary-foreground rounded text-xs">
                            {group.name}: {opt.value}
                          </span>
                        ) : null;
                      });
                    })}
                  </div>
                </div>

                <Input 
                  value={v.weight_grams} 
                  onChange={(e) => actions.updateVariant(v.id, "weight_grams", e.target.value)} 
                  placeholder="Weight (g)" 
                />
                <Input 
                  value={v.initial_stock} 
                  onChange={(e) => actions.updateVariant(v.id, "initial_stock", e.target.value)} 
                  placeholder="Initial Stock" 
                />
                <Input 
                  className="md:col-span-2" 
                  value={v.price_override} 
                  onChange={(e) => actions.updateVariant(v.id, "price_override", e.target.value)} 
                  placeholder="Price Override (optional)" 
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}