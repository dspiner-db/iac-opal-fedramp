import * as pulumi from "@pulumi/pulumi";

export interface CETags {
    Project: string
    Owner: string
    Environment: string
    ProjectId: string
}

export interface CECustomComponentArgs {
    tags: CETags
}

export default class CECustomComponent extends pulumi.ComponentResource {
    name: string
    tags: CETags

    constructor(module: string, name: string, opts: CECustomComponentArgs, custom?: pulumi.CustomResourceOptions){
        super(module, name, {}, custom)
        this.name = name
        this.tags = opts.tags

    }

    protected getTags(Name: string): { [key: string]: string } {
        let temp: any = this.tags
        temp['Name'] = Name
        return temp
    }
}