import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { ICalculatorSubnet, calculate, getSubnetDetails } from 'subnet-cidr-calculator'

export interface VpcConfig extends pulumi.ComponentResourceOptions {
    vpcCidr: string
    subnetMask: string
    tags: {
        Project: string
        Owner: string
        Environment: string
        ProjectId: string
    }
    azs: aws.GetAvailabilityZonesResult
}

export interface CENetworkSubnet { subnet: aws.ec2.Subnet, az: string }

export default class CENetwork extends pulumi.ComponentResource {
    vpc: aws.ec2.Vpc
    igw: aws.ec2.InternetGateway
    nat: aws.ec2.NatGateway
    subnets: {
        public: CENetworkSubnet[]
        private: CENetworkSubnet[]
    } = {
        public: [],
        private: []
    }
    tags: {
        Project: string
        Owner: string
        Environment: string
        ProjectId: string
    }
    constructor(name: string, opts: VpcConfig){
        super('corpeng:network', name, {}, {})
        this.tags = opts.tags
        // Get the available subnets
        const vpcSubnets = this.getSubnets(opts.vpcCidr, opts.subnetMask.toString())
        // Create the VPC
        let vpc_name = `${name}/vpc`
        this.vpc = new aws.ec2.Vpc(vpc_name, {
            cidrBlock: opts.vpcCidr,
            enableDnsHostnames: true,
            tags: this.getTags(vpc_name)
        }, { parent: this })
        
        // // Create the containers the Public / Private Subnets will reside
        // this.subnets = {
        //     public: [],
        //     private: []
        // }
        // const publicSubnets: { subnet: aws.ec2.Subnet; az: string }[] = []
        // const privateSubnets: { subnet: aws.ec2.Subnet; az: string }[] = []
        
        let subnetCounter = 0
        // Loop Through the Availability Zones
        opts.azs.names.forEach((Az: string) => {
            let az = Az.split('-')[2]
            // Create the Base Name for All the subnets
            let subnetBaseName = `${name}/subnet`
            // Create a Unique Private Subnet Name
            let privateName = `${subnetBaseName}-private-${az}`
            // Create a Unique Public Subnet Name
            let publicName = `${subnetBaseName}-public-${az}`
            // Create the public Tags
            let publicTags = this.getTags(publicName)
            // Create the private Tags
            let privateTags = this.getTags(privateName)

            // Create and Add the Private Subnet to container
            this.subnets.private.push(
                {
                    subnet: new aws.ec2.Subnet(privateName, {
                        vpcId: this.vpc.id,
                        cidrBlock: vpcSubnets[subnetCounter].value,
                        availabilityZone: Az,
                        tags: privateTags
                    }, { parent: this.vpc}),
                    az
                }
            )
            subnetCounter ++

            // Create and Add the Private Subnet to container
            this.subnets.public.push(
                {
                    subnet: new aws.ec2.Subnet(publicName, {
                        vpcId: this.vpc.id,
                        cidrBlock: vpcSubnets[subnetCounter].value,
                        availabilityZone: Az,
                        tags: publicTags
                    }, { parent: this.vpc}),
                    az
            })
            subnetCounter ++
        })

        // Create the Elastic IP for the Nat Gateway
        let natGatewayIP_name = `${name}/nat/eip`
        const natGatewayIP = new aws.ec2.Eip(natGatewayIP_name,{
            vpc: true,
            tags: this.getTags(natGatewayIP_name)
        }, { parent: this.vpc })
        // Create the NatGateway
        let natGateway_name = `${name}/nat`
        this.nat = new aws.ec2.NatGateway(natGateway_name, {
            subnetId: this.subnets.public[0].subnet.id,
            allocationId: natGatewayIP.allocationId,
            tags: this.getTags(natGateway_name)
        }, { parent: this.vpc })
        // Create the Internet Gateway
        let clusterIGW_name = `${name}/igw`
        this.igw = new aws.ec2.InternetGateway(clusterIGW_name, {
            vpcId: this.vpc.id,
            tags: this.getTags(clusterIGW_name)
        }, { parent: this.vpc })
        // Create Private Subnet Routing Tables & Associations
        this.subnets.private.forEach((item) => {
            // Create Private Route Table
            let rt_name = `${name}/rt-private-${item.az}`
            let privateRT = new aws.ec2.RouteTable(rt_name, {
                vpcId: this.vpc.id,
                routes: [
                    {
                        cidrBlock: '0.0.0.0/0',
                        natGatewayId: this.nat.id
                    }
                ],
                tags: this.getTags(rt_name)
            }, { parent: this.vpc })
            // Associate Route Table
            new aws.ec2.RouteTableAssociation(`${name}/rtacc-private-${item.az}`, {
                subnetId: item.subnet.id,
                routeTableId: privateRT.id
            }, { parent: privateRT })

        })

        // Create Public Route Table
        let publicRT_name = `${name}/rt-public`
        const publicRT = new aws.ec2.RouteTable(publicRT_name, {
            vpcId: this.vpc.id,
            routes: [
                {
                    cidrBlock: '0.0.0.0/0',
                    gatewayId: this.igw.id
                }
            ],
            tags: this.getTags(publicRT_name)
        }, { parent: this.vpc })
        // Associate Public Subnets with Public Routing Table
        this.subnets.public.forEach((item) => {
            new aws.ec2.RouteTableAssociation(`${name}/rtacc-public-${item.az}`, {
                subnetId: item.subnet.id,
                routeTableId: publicRT.id
            }, { parent: publicRT })
        })

    }

    private getSubnets(cidr: string, subnetNetmask: string): ICalculatorSubnet[] {
        // Get the Cidr in a format for for creating subnets
        let [vpcAddress, netmask] = cidr.split('/')
    
        // Define the subnet opts.vpcCidrs based on vpc opts.vpcCidr and subnetNetmask
        let details = getSubnetDetails(cidr)
        let r: ICalculatorSubnet[] = [ {
            value: `${details.startAddr}/${subnetNetmask}`,
            ipRange: {
                start: details.startAddr,
                end: details.endAddr
            },
            range: {
                from: 0,
                to: 0
            },
            isOverlap: false
        } ]
        let t = calculate(vpcAddress, netmask, [ cidr ])
    
        return r.concat(t.subnets.filter(s => s.value.includes(`/${subnetNetmask}`)))
    
    }

    private getTags(Name: string): { [key: string]: string } {
        let temp: any = this.tags
        temp['Name'] = Name
        return temp
    }
}