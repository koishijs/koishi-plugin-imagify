export function template(template: string, data: { [key: string]: any }) {
    return template.replace(/{(.*?)}/g, (_, key) => data[key] || '')
}
