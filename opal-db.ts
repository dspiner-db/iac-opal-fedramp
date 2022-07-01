import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { randomBytes } from "crypto";

import CENetwork, { CENetworkSubnet } from './network'

interface OpalDBArgs {
    network: CENetwork
    nodeGroup: aws.ec2.SecurityGroup
    clusterGroup: aws.ec2.SecurityGroup
    port: number
    tags: {
        Project: string
        Owner: string
        Environment: string
        ProjectId: string
    }
}

export default class OpalDB extends pulumi.ComponentResource {
    securityGroup: aws.ec2.SecurityGroup
    database: aws.rds.Instance
    tags: {
        Project: string
        Owner: string
        Environment: string
        ProjectId: string
    }

    constructor(name: string, opts: OpalDBArgs, custom?: pulumi.CustomResourceOptions){
        super('corpeng:opal-db', name, {}, custom)
        this.tags = opts.tags
        let dbSG_name = `${name}-db`
        this.securityGroup = new aws.ec2.SecurityGroup(dbSG_name, {
            vpcId: opts.network.vpc.id,
            description: `Communication between Database on EKS nodegroups`,
            ingress: [
                {
                    fromPort: opts.port,
                    toPort: opts.port,
                    protocol: 'tcp',
                    securityGroups: [ opts.nodeGroup.id ]
                },
                {
                    fromPort: opts.port,
                    toPort: opts.port,
                    protocol: 'tcp',
                    securityGroups: [ opts.clusterGroup.id ]
                }
            ],
            egress: [
                {
                    fromPort: opts.port,
                    toPort: opts.port,
                    protocol: 'tcp',
                    securityGroups: [ opts.nodeGroup.id ]
                },
                {
                    fromPort: opts.port,
                    toPort: opts.port,
                    protocol: 'tcp',
                    securityGroups: [ opts.clusterGroup.id ]
                }
            ],
            tags: this.getTags(dbSG_name)
        }, { parent: this })

        // Update Node Group
        new aws.ec2.SecurityGroupRule(`node-ingress-database`, {
            type: 'ingress',
            protocol: 'tcp',
            toPort: opts.port,
            fromPort: opts.port,
            securityGroupId: opts.nodeGroup.id,
            sourceSecurityGroupId: this.securityGroup.id
        }, { parent: opts.nodeGroup })

        new aws.ec2.SecurityGroupRule(`node-egress-database`, {
            type: 'egress',
            protocol: 'tcp',
            toPort: opts.port,
            fromPort: opts.port,
            securityGroupId: opts.nodeGroup.id,
            sourceSecurityGroupId: this.securityGroup.id
        }, { parent: opts.nodeGroup })

        // Update Cluster Group
        new aws.ec2.SecurityGroupRule(`cluster-ingress-database`, {
            type: 'ingress',
            protocol: 'tcp',
            toPort: opts.port,
            fromPort: opts.port,
            securityGroupId: opts.clusterGroup.id,
            sourceSecurityGroupId: this.securityGroup.id
        }, { parent: opts.clusterGroup })

        new aws.ec2.SecurityGroupRule(`cluster-egress-database`, {
            type: 'egress',
            protocol: 'tcp',
            toPort: opts.port,
            fromPort: opts.port,
            securityGroupId: opts.clusterGroup.id,
            sourceSecurityGroupId: this.securityGroup.id
        }, { parent: opts.clusterGroup })
        

        const dbPass = randomBytes(48).toString('hex')
        const dbKey = new aws.kms.Key(`${name}-database-key`, {}, { parent: this })
        
        const dbSubnetGroup = new aws.rds.SubnetGroup(`${name}-subnet-group`, {
            subnetIds: opts.network.subnets.private.map( (s: CENetworkSubnet) => s.subnet.id),
        }, { parent: this })
    
        this.database = new aws.rds.Instance(name, {
            identifier: name, // Project Name DB
            instanceClass: 'db.m5.large',
            storageType: 'gp2',
            allocatedStorage: 50,
            skipFinalSnapshot: true,
    
            engine: 'postgres',
            engineVersion: '12.10',
            
            kmsKeyId: dbKey.arn,
            storageEncrypted: true,
            dbName: `opal`,
            username: `postgres`,
            password: dbPass,
    
            availabilityZone: opts.network.subnets.private[0].subnet.availabilityZone,
            vpcSecurityGroupIds: [ this.securityGroup.id ],
            
            dbSubnetGroupName: dbSubnetGroup.name,
    
        }, { parent: this })

        console.log(`DB Pass: ${dbPass}`)
    }

    private getTags(Name: string): { [key: string]: string } {
        let temp: any = this.tags
        temp['Name'] = Name
        return temp
    }
}