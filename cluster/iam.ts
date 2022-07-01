import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import CECustomComponent from './default'

interface IAMOpts {
    tags: {
        Project: string
        Owner: string
        Environment: string
        ProjectId: string
    }
}

export default class CEIAM extends CECustomComponent {
    clusterRole: aws.iam.Role
    instanceRole: aws.iam.Role
    albRole: aws.iam.Role | undefined

    constructor(name: string, opts: IAMOpts, custom?: pulumi.CustomResourceOptions){
        super('corpeng:cluster:iam', name, { tags: opts.tags }, custom)

        let assumeRolePolicy = {
            Version: "2012-10-17",
            Statement: [
                {
                    Action: "sts:AssumeRole",
                    Principal: { 
                        Service: "eks.amazonaws.com"
                    },
                    Effect: "Allow"
                }
            ]
        }

        let clusterRole_name = `${name}-role-cluster`  
        this.clusterRole = new aws.iam.Role(clusterRole_name, {
            assumeRolePolicy: JSON.stringify(assumeRolePolicy),
            inlinePolicies: [
                {
                    name: `${name}-policy-elb`,
                    policy: JSON.stringify({
                        Version: "2012-10-17",
                        Statement: [
                            {
                                Action: [
                                    "ec2:DescribeAccountAttributes",
                                    "ec2:DescribeAddress",
                                    "ec2:DescribeInternetGateways"
                                ],
                                Resource: "*",
                                Effect: "Allow"
                            }
                        ]
                    })
                }
            ],
            managedPolicyArns: [ 
                `arn:aws:iam::aws:policy/AmazonEKSClusterPolicy`,
                `arn:aws:iam::aws:policy/AmazonEKSVPCResourceController`
            ],
            tags: this.getTags(clusterRole_name)
        }, { parent: this })
    
        let instanceRole_name = `${name}-role-instance`
        assumeRolePolicy.Statement[0].Principal.Service = "ec2.amazonaws.com"
    
        this.instanceRole = new aws.iam.Role(instanceRole_name, {
            assumeRolePolicy: JSON.stringify(assumeRolePolicy),
            managedPolicyArns: [ 
                `arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy`,
                `arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly`,
                `arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore`,
                `arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy`,
                `arn:aws:iam::aws:policy/AmazonS3FullAccess`
            ],
            tags: this.getTags(instanceRole_name)
        }, { parent: this })

    }
}